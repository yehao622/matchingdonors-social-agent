#include <iostream>
#include <string>
#include <boost/asio.hpp>

using boost::asio::ip::tcp;

// Handle single client connection
void handle_client(tcp::socket &socket)
{
    try
    {
        // Read incoming http traffic
        boost::asio::streambuf request;
        // Read until hit the blank line that ends http headers
        boost::asio::read_until(socket, request, "\r\n\r\n");

        std::istream request_stream(&request);
        std::string header_line;
        std::cout << "\n----- New Incoming Request ------\n";

        // Print the raw http headers so we can inspect the traffic
        while (std::getline(request_stream, header_line) && header_line != "\r")
        {
            std::cout << header_line << "\n";
        }

        // Prepare a dummy DevSecOps response
        std::string response_body = "<html><body><h1>Zero-Trust Gateway Active</h1><p>Traffic intercepted successfully.</p></body></html>";

        std::string http_response =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/html\r\n"
            "Content-Length: " +
            std::to_string(response_body.length()) + "\r\n"
                                                     "Connection: close\r\n\r\n" +
            response_body;

        // Send the response back to the browser/client
        boost::asio::write(socket, boost::asio::buffer(http_response));
    }
    catch (std::exception &e)
    {
        std::cerr << "Exception in thread: " << e.what() << "\n";
    }
}

int main(int argc, char *argv[])
{
    try
    {
        // The io_context represents your program's link to the OS I/O services
        boost::asio::io_context io_context;

        // Create an acceptor listening on port 8080 (ipv4)
        tcp::acceptor acceptor(io_context, tcp::endpoint(tcp::v4(), 8080));
        std::cout << "🛡️  Zero-Trust C++ Gateway listening on port 8080...\n";

        // Keep accepting new connections
        while (true)
        {
            tcp::socket socket(io_context);
            // This calls blocks until a browser or curl command connects to port 8080
            acceptor.accept(socket);

            std::cout << "Connection received from: " << socket.remote_endpoint().address().to_string() << "\n";

            // Handle the connection sync
            handle_client(socket);
        }
    }
    catch (std::exception &e)
    {
        std::cerr << "Exception: " << e.what() << "\n";
    }

    return 0;
}