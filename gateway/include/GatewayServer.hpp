#include "../include/ProxySession.hpp"

class GatewayServer
{
private:
    tcp::acceptor acceptor_;
    boost::asio::io_context &ioc_;
    boost::asio::ssl::context ssl_context_;
    SecurityEngine waf_;

    tcp::endpoint backend_endpoint_; // Stores the Node.js IP!

    void accept_connections();
    void resolve_backend();

public:
    GatewayServer(boost::asio::io_context &ioc, short port);
};