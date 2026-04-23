#pragma once
#include "SecurityEngine.hpp"
#include <boost/asio.hpp>
#include <memory>

using boost::asio::ip::tcp;

class GatewayServer
{
private:
    tcp::acceptor acceptor_;
    boost::asio::io_context &ioc_;
    SecurityEngine waf_;

    void accept_connections();

public:
    GatewayServer(boost::asio::io_context &ioc, short port);
};