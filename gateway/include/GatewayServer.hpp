#pragma once
#include <boost/asio.hpp>
#include <boost/asio/ssl.hpp>
#include <boost/asio/signal_set.hpp>
#include <memory>
#include <memory_resource>

using boost::asio::ip::tcp;

class SecurityEngine;

class GatewayServer
{
private:
    tcp::acceptor acceptor_;
    boost::asio::io_context &ioc_;
    boost::asio::ssl::context ssl_context_;
    boost::asio::signal_set signals_;
    std::shared_ptr<SecurityEngine> waf_;

    tcp::endpoint backend_endpoint_;                   // Stores the Node.js IP!
    std::pmr::synchronized_pool_resource memory_pool_; // Thread-safe memory allocator for massive concurrency

    void accept_connections();
    void resolve_backend();

public:
    GatewayServer(boost::asio::io_context &ioc, short port);
};