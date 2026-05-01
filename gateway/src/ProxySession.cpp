#include "../include/ProxySession.hpp"
#include "../include/SecurityEngine.hpp"
#include <spdlog/spdlog.h>

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

    // Look how much cleaner this is! No more async_resolve!
    backend_socket_.async_connect(backend_endpoint_,
                                  [this, self, initial_bytes](boost::system::error_code ec)
                                  {
                                      if (!ec)
                                      {
                                          // OPTIMIZATION: Backend Socket Tuning <---
                                          boost::system::error_code option_ec;
                                          backend_socket_.set_option(tcp::no_delay(true), option_ec);
                                          backend_socket_.set_option(boost::asio::socket_base::keep_alive(true), option_ec);

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

ProxySession::ProxySession(tcp::socket socket, boost::asio::ssl::context &ssl_ctx, boost::asio::io_context &ioc, std::shared_ptr<SecurityEngine> waf, tcp::endpoint backend_endpoint)
    : client_socket_(std::move(socket),
                     ssl_ctx),
      backend_socket_(ioc),
      waf_(std::move(waf)),
      backend_endpoint_(backend_endpoint)
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

                                           if (waf_->inspect_traffic(client_ip, request_view))
                                           {
                                               // Check if the user is asking for the health endpoint
                                               if (request_view.find("GET /api/health") != std::string::npos)
                                               {
                                                   spdlog::info("🩺 Health Check intercepted from {}. Responding locally.", client_ip);

                                                   // Build a raw HTTP JSON response directly
                                                   std::string health_response =
                                                       "HTTP/1.1 200 OK\r\n"
                                                       "Content-Type: application/json\r\n"
                                                       "Connection: close\r\n\r\n"
                                                       "{\"status\":\"healthy\", \"service\":\"Zero-Trust C++ Gateway\", \"version\":\"1.0.0\"}";

                                                   // Send it directly back to the client
                                                   auto self(shared_from_this());
                                                   boost::asio::async_write(client_socket_, boost::asio::buffer(health_response),
                                                                            [this, self](boost::system::error_code ec, std::size_t)
                                                                            {
                                                                                close_session();
                                                                            });

                                                   return; // don't connect to Node.js
                                               }

                                               spdlog::info("🔒 [SSL Gateway] Clean traffic from {}. Forwarding to Node...", client_ip);
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