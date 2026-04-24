#include "../include/GatewayServer.hpp"
#include <iostream>

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