#include "../include/GatewayServer.hpp"
#include <iostream>

void GatewayServer::accept_connections()
{
    acceptor_.async_accept(
        [this](boost::system::error_code ec, tcp::socket socket)
        {
            if (!ec)
            {
                // Pass the SSL context into the Proxy Session
                std::make_shared<ProxySession>(std::move(socket), ssl_context_, ioc_, waf_)->start();
            }
            // Recursively accept the next connection without blocking
            accept_connections();
        });
}

GatewayServer::GatewayServer(boost::asio::io_context &ioc, short port) : ioc_(ioc),
                                                                         acceptor_(ioc, tcp::endpoint(tcp::v4(), port)),
                                                                         ssl_context_(boost::asio::ssl::context::tlsv12)
{
    ssl_context_.set_options(boost::asio::ssl::context::default_workarounds | boost::asio::ssl::context::no_sslv2);
    ssl_context_.use_certificate_chain_file("server.crt");
    ssl_context_.use_private_key_file("server.key", boost::asio::ssl::context::pem);

    std::cout << "🛡️ Zero-Trust C++ Gateway listening on port " << port << "...\n";
    std::cout << "🔄 Proxying traffic to Node.js backend on port 3001...\n";
    accept_connections();
}