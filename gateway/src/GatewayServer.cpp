#include "../include/GatewayServer.hpp"

void GatewayServer::accept_connections()
{
    acceptor_.async_accept(
        [this](boost::system::error_code ec, tcp::socket socket)
        {
            if (!ec)
            {
                // Network Socket Tuning <---
                boost::system::error_code option_ec;
                // Disable Nagle's Algorithm (Send data instantly!)
                socket.set_option(tcp::no_delay(true), option_ec);
                // Enable OS-level Keep-Alive heartbeats
                socket.set_option(boost::asio::socket_base::keep_alive(true), option_ec);
                if (option_ec)
                {
                    spdlog::warn("Failed to set socket options: {}", option_ec.message());
                }

                // Pass the SSL context into the Proxy Session
                std::make_shared<ProxySession>(std::move(socket), ssl_context_, ioc_, waf_, backend_endpoint_)->start();
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

    resolve_backend();

    spdlog::info("🛡️ Zero-Trust C++ Gateway listening securely on port {} (HTTPS)...", port);
    accept_connections();
}

void GatewayServer::resolve_backend()
{
    tcp::resolver resolver(ioc_);
    const char *env_host = std::getenv("BACKEND_HOST");
    std::string target_host = env_host ? env_host : "localhost";

    auto results = resolver.resolve(target_host, "3001");
    backend_endpoint_ = *results.begin(); // Save the first IP address found
    spdlog::info("🔗 Backend resolved to fixed IP: {}", backend_endpoint_.address().to_string());
}