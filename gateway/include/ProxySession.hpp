#pragma once
#include "SecurityEngine.hpp"
#include <boost/asio.hpp>
#include <memory>

using boost::asio::ip::tcp;

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

    void close_session();
    void reject_traffic();
    void connect_to_backend(std::size_t initial_bytes);
    void pump_data(tcp::socket *source, tcp::socket *destination, std::array<char, 8192> *buffer);

public:
    ProxySession(tcp::socket socket, boost::asio::io_context &ioc, SecurityEngine &waf);
    void start();
};