#include "../include/ProxySession.hpp"
#include <iostream>

void ProxySession::close_session()
{
    boost::system::error_code ec;
    if (client_socket_.is_open())
        client_socket_.close(ec);
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
                                    // Start the bidirectional data pump

                                    // Pump 1. Client -> backend
                                    pump_data(&client_socket_, &backend_socket_, &client_buffer_);

                                    // Pump 2. Backend -> client
                                    pump_data(&backend_socket_, &client_socket_, &backend_buffer_);
                                }
                                else
                                {
                                    std::cerr << "❌ DNS Resolution Failed: " << ec.message() << "\n";
                                    close_session();
                                }
                            });
}

void ProxySession::pump_data(tcp::socket *source, tcp::socket *destination, std::array<char, 8192> *buffer)
{
    auto self(shared_from_this());

    source->async_read_some(boost::asio::buffer(*buffer),
                            [this, self, source, destination, buffer](boost::system::error_code ec, std::size_t length)
                            {
                                if (!ec)
                                {
                                    // Write to destination buffer
                                    boost::asio::async_write(*destination, boost::asio::buffer(*buffer, length),
                                                             [this, self, source, destination, buffer](boost::system::error_code ec, std::size_t)
                                                             {
                                                                 if (!ec)
                                                                 {
                                                                     pump_data(source, destination, buffer);
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

ProxySession::ProxySession(tcp::socket socket, boost::asio::io_context &ioc, SecurityEngine &waf) : client_socket_(std::move(socket)),
                                                                                                    backend_socket_(ioc),
                                                                                                    resolver_(ioc),
                                                                                                    waf_(waf)
{
}

void ProxySession::start()
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