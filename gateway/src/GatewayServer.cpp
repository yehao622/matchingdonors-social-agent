#include "../include/GatewayServer.hpp"
#include <iostream>

class ProxySession : public std::enable_shared_from_this<ProxySession>
{
private:
    tcp::socket client_socket_;
    tcp::socket backend_socket_;
    tcp::resolver resolver_;

    // Memory-safe buffers for our bidirectional pump
    std::array<char, 8192> client_buffer_;
    std::array<char, 8192> backend_buffer_;

    SecurityEngine &waf_;

    // If one side drops the connection, we safely close both sockets
    void close_session()
    {
        boost::system::error_code ec;
        if (client_socket_.is_open())
            client_socket_.close(ec);
        if (backend_socket_.is_open())
            backend_socket_.close(ec);
    }

    void reject_traffic()
    {
        auto self(shared_from_this());
        std::string forbidden_response =
            "HTTP/1.1 403 Forbidden\r\n"
            "Content-Type: text/html; charset=utf-8\r\n"
            "Connection: close\r\n\r\n"
            "<h1>403 Forbidden</h1><p>Your request was blocked by the Zero-Trust Gateway.</p>";

        boost::asio::async_write(client_socket_, boost::asio::buffer(forbidden_response),
                                 [this, self](boost::system::error_code ec, std::size_t)
                                 {
                                     close_session();
                                 });
    }

    void connect_to_backend(std::size_t initial_bytes)
    {
        auto self(shared_from_this());

        // Try to read BACKEND_HOST from Docker, otherwiese, default to 'localhost'
        const char *env_host = std::getenv("BACKEND_HOST");
        std::string target_host = env_host ? env_host : "localhost";

        // Resolve the local Node.js server port 3001
        resolver_.async_resolve(target_host, "3001",
                                [this, self, initial_bytes](const boost::system::error_code &ec, tcp::resolver::results_type results)
                                {
                                    if (!ec)
                                    {
                                        boost::asio::async_connect(backend_socket_, results,
                                                                   [this, self, initial_bytes](const boost::system::error_code &ec, const tcp::endpoint &endpoint)
                                                                   {
                                                                       if (!ec)
                                                                       {
                                                                           // Forward the INITIAL chunk we already read
                                                                           boost::asio::async_write(backend_socket_, boost::asio::buffer(client_buffer_, initial_bytes),
                                                                                                    [this, self](boost::system::error_code ec, std::size_t)
                                                                                                    {
                                                                                                        if (!ec)
                                                                                                        {
                                                                                                            pump_from_client();
                                                                                                            pump_from_backend();
                                                                                                        }
                                                                                                        else
                                                                                                        {
                                                                                                            std::cerr << "❌ Failed to write initial bytes: " << ec.message() << "\n";
                                                                                                            close_session();
                                                                                                        }
                                                                                                    });
                                                                       }
                                                                       else
                                                                       {
                                                                           // Observability! If it fails, tell us EXACTLY why.
                                                                           std::cerr << "❌ Failed to connect to Node.js on 3001: " << ec.message() << "\n";
                                                                           close_session();
                                                                       }
                                                                   });
                                    }
                                    else
                                    {
                                        std::cerr << "❌ DNS Resolution Failed: " << ec.message() << "\n";
                                        close_session();
                                    }
                                });
    }

    // --- THE BIDIRECTIONAL PUMP ---
    // Continually reads from the client and writes to the backend (handles large POST requests)
    void pump_from_client()
    {
        auto self(shared_from_this());
        client_socket_.async_read_some(boost::asio::buffer(client_buffer_),
                                       [this, self](boost::system::error_code ec, std::size_t length)
                                       {
                                           if (!ec)
                                           {
                                               boost::asio::async_write(backend_socket_, boost::asio::buffer(client_buffer_, length),
                                                                        [this, self](boost::system::error_code ec, std::size_t)
                                                                        {
                                                                            if (!ec)
                                                                            {
                                                                                pump_from_client();
                                                                            }
                                                                            else
                                                                                close_session();
                                                                        });
                                           }
                                           else
                                               close_session();
                                       });
    }

    // Continually reads Node.js responses and writes them back to the user's browser
    void pump_from_backend()
    {
        auto self(shared_from_this());
        backend_socket_.async_read_some(boost::asio::buffer(backend_buffer_),
                                        [this, self](boost::system::error_code ec, std::size_t length)
                                        {
                                            if (!ec)
                                            {
                                                boost::asio::async_write(client_socket_, boost::asio::buffer(backend_buffer_, length),
                                                                         [this, self](boost::system::error_code ec, std::size_t)
                                                                         {
                                                                             if (!ec)
                                                                             {
                                                                                 pump_from_backend();
                                                                             }
                                                                             else
                                                                                 close_session();
                                                                         });
                                            }
                                            else
                                                close_session();
                                        });
    }

public:
    ProxySession(tcp::socket socket, boost::asio::io_context &ioc, SecurityEngine &waf) : client_socket_(std::move(socket)),
                                                                                          backend_socket_(ioc),
                                                                                          resolver_(ioc),
                                                                                          waf_(waf)
    {
    }

    void start()
    {
        auto self(shared_from_this()); // Keep object alive in memory during async operations
        client_socket_.async_read_some(boost::asio::buffer(client_buffer_),
                                       [this, self](boost::system::error_code ec, std::size_t length)
                                       {
                                           if (!ec)
                                           {
                                               std::string client_ip = client_socket_.remote_endpoint().address().to_string();
                                               // Use C++17 string_view for zero-copy string inspection!
                                               std::string_view request_view(client_buffer_.data(), length);

                                               // --- THE ZERO-TRUST CHECK ---
                                               if (waf_.inspect_traffic(client_ip, request_view))
                                               {
                                                   std::cout << "✅ [Gateway] Clean traffic from " << client_ip << ". Forwarding...\n";
                                                   connect_to_backend(length);
                                               }
                                               else
                                               {
                                                   reject_traffic(); // Block the hacker/spammer!
                                               }
                                           }
                                           else
                                           {
                                               close_session();
                                           }
                                       });
    }
};

void GatewayServer::accept_connections()
{
    acceptor_.async_accept(
        [this](boost::system::error_code ec, tcp::socket socket)
        {
            if (!ec)
            {
                std::make_shared<ProxySession>(std::move(socket), ioc_, waf_)->start();
            }
            // Recursively accept the next connection without blocking
            accept_connections();
        });
}

GatewayServer::GatewayServer(boost::asio::io_context &ioc, short port) : ioc_(ioc),
                                                                         acceptor_(ioc, tcp::endpoint(tcp::v4(), port))
{
    std::cout << "🛡️ Zero-Trust C++ Gateway listening on port " << port << "...\n";
    std::cout << "🔄 Proxying traffic to Node.js backend on port 3001...\n";
    accept_connections();
}