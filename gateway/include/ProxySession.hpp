#pragma once
#include "SecurityEngine.hpp"
#include <boost/asio.hpp>
#include <boost/asio/ssl.hpp>
#include <memory>
#include <spdlog/spdlog.h>

using boost::asio::ip::tcp;

class ProxySession : public std::enable_shared_from_this<ProxySession>
{
private:
    boost::asio::ssl::stream<tcp::socket> client_socket_;
    tcp::socket backend_socket_;
    tcp::endpoint backend_endpoint_;

    // Memory-safe buffers for our bidirectional pump
    std::array<char, 8192> client_buffer_;
    std::array<char, 8192> backend_buffer_;

    SecurityEngine &waf_;

    void close_session();
    void reject_traffic();
    void connect_to_backend(std::size_t initial_bytes);
    void read_from_client();

public:
    ProxySession(tcp::socket socket, boost::asio::ssl::context &ssl_ctx, boost::asio::io_context &ioc, SecurityEngine &waf, tcp::endpoint backend_endpoint);
    void start();

    // Template here handles both SSL streams AND TCP sockets
    template <typename SourceSocket, typename DestSocket>
    void pump_data(SourceSocket *source, DestSocket *destination, std::array<char, 8192> *buffer)
    {
        auto self(shared_from_this());

        source->async_read_some(boost::asio::buffer(*buffer),
                                [this, self, source, destination, buffer](boost::system::error_code ec, std::size_t length)
                                {
                                    if (!ec)
                                    {
                                        boost::asio::async_write(*destination, boost::asio::buffer(*buffer, length),
                                                                 [this, self, source, destination, buffer](boost::system::error_code ec, std::size_t /*length*/)
                                                                 {
                                                                     if (!ec)
                                                                     {
                                                                         pump_data(source, destination, buffer); // Keep pumping!
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
};