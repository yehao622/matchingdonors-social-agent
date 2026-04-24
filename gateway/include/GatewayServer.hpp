#include "../include/ProxySession.hpp"

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