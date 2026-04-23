#include "../include/GatewayServer.hpp"
#include <iostream>

int main(int argc, char *argv[])
{
    try
    {
        // The io_context represents your program's link to the OS I/O services
        boost::asio::io_context io_context;
        GatewayServer server(io_context, 8080);
        io_context.run();
    }
    catch (std::exception &e)
    {
        std::cerr << "Server Exception: " << e.what() << "\n";
    }

    return 0;
}