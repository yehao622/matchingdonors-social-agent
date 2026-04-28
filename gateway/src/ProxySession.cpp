#include "../include/ProxySession.hpp"
#include <iostream>

void ProxySession::close_session()
{
    boost::system::error_code ec;
    if (client_socket_.lowest_layer().is_open())
        client_socket_.lowest_layer().close(ec);
    if (backend_socket_.is_open())
        backend_socket_.close(ec);
}

void ProxySession::reject_traffic()
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

void ProxySession::connect_to_backend(std::size_t initial_bytes)
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
                                                               [this, self, initial_bytes](boost::system::error_code ec, tcp::endpoint)
                                                               {
                                                                   if (!ec)
                                                                   {
                                                                       boost::asio::async_write(backend_socket_, boost::asio::buffer(client_buffer_, initial_bytes),
                                                                                                [this, self](boost::system::error_code ec, std::size_t)
                                                                                                {
                                                                                                    if (!ec)
                                                                                                    {
                                                                                                        pump_data(&client_socket_, &backend_socket_, &client_buffer_);
                                                                                                        pump_data(&backend_socket_, &client_socket_, &backend_buffer_);
                                                                                                    }
                                                                                                    else
                                                                                                    {
                                                                                                        close_session();
                                                                                                    }
                                                                                                });
                                                                   }
                                                                   else
                                                                   {
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

ProxySession::ProxySession(tcp::socket socket, boost::asio::ssl::context &ssl_ctx, boost::asio::io_context &ioc, SecurityEngine &waf) : client_socket_(std::move(socket), ssl_ctx),
                                                                                                                                        backend_socket_(ioc),
                                                                                                                                        resolver_(ioc),
                                                                                                                                        waf_(waf)
{
}

void ProxySession::start()
{
    auto self(shared_from_this()); // Keep object alive in memory during async operations
    client_socket_.async_handshake(boost::asio::ssl::stream_base::server,
                                   [this, self](const boost::system::error_code &error)
                                   {
                                       if (!error)
                                       {
                                           read_from_client(); // Handshake success! Now read the HTTP data.
                                       }
                                       else
                                       {
                                           close_session();
                                       }
                                   });
}

void ProxySession::read_from_client()
{
    auto self(shared_from_this());
    client_socket_.async_read_some(boost::asio::buffer(client_buffer_),
                                   [this, self](boost::system::error_code ec, std::size_t length)
                                   {
                                       if (!ec)
                                       {
                                           std::string client_ip = client_socket_.lowest_layer().remote_endpoint().address().to_string();
                                           std::string_view request_view(client_buffer_.data(), length);

                                           if (waf_.inspect_traffic(client_ip, request_view))
                                           {
                                               std::cout << "🔒 [SSL Gateway] Clean traffic from " << client_ip << ". Forwarding to Node...\n";
                                               connect_to_backend(length);
                                           }
                                           else
                                           {
                                               reject_traffic();
                                           }
                                       }
                                       else
                                       {
                                           close_session();
                                       }
                                   });
}