#include "../include/GatewayServer.hpp"
#include "../include/ProxySession.hpp"
#include "../include/SecurityEngine.hpp"
#include <spdlog/spdlog.h>

void GatewayServer::accept_connections()
{
    acceptor_.async_accept(
        [this](boost::system::error_code ec, tcp::socket socket)
        {
            // Check if deliberately closed the server <---
            if (ec == boost::asio::error::operation_aborted)
            {
                spdlog::info("🚪 Acceptor closed cleanly. No longer accepting traffic.");
                return; // Stop the loop!
            }

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

                // Crave for memory, pass the SSL context into the Proxy Session
                std::allocate_shared<ProxySession>(
                    std::pmr::polymorphic_allocator<ProxySession>(&memory_pool_),
                    std::move(socket),
                    ssl_context_,
                    ioc_,
                    waf_,
                    backend_endpoint_)
                    ->start();
            }
            else
            {
                spdlog::error("Accept error: {}", ec.message());
            }
            // Recursively accept the next connection without blocking
            accept_connections();
        });
}

GatewayServer::GatewayServer(boost::asio::io_context &ioc, short port) : ioc_(ioc),
                                                                         acceptor_(ioc, tcp::endpoint(tcp::v4(), port)),
                                                                         ssl_context_(boost::asio::ssl::context::tlsv12),
                                                                         signals_(ioc, SIGINT, SIGTERM)
{
    // Initialize the WAF Security Engine
    waf_ = std::make_shared<SecurityEngine>();

    ssl_context_.set_options(boost::asio::ssl::context::default_workarounds | boost::asio::ssl::context::no_sslv2);
    ssl_context_.use_certificate_chain_file("server.crt");
    ssl_context_.use_private_key_file("server.key", boost::asio::ssl::context::pem);

    resolve_backend();

    spdlog::info("🛡️ Zero-Trust C++ Gateway listening securely on port {} (HTTPS)...", port);

    // Gracefully shutdown
    signals_.async_wait(
        [this](boost::system::error_code ec, int signal_number)
        {
            if (!ec)
            {
                spdlog::warn("🛑 Received OS Kill Signal ({}). Initiating Graceful Shutdown...", signal_number);
                spdlog::info("📉 Stopping new connections. Waiting for existing traffic to drain...");
                spdlog::default_logger()->flush();

                // Closing the acceptor stops new people from connecting.
                // Because of how Boost works, the io_context will stay alive
                // until all EXISTING ProxySessions finish their downloads!
                boost::system::error_code ignore_ec;
                acceptor_.close(ignore_ec);
            }
        });

    // Start accepting traffic
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