#include "../include/GatewayServer.hpp"
#include <thread>
#include <vector>

#define SPDLOG_COMPILED_LIB 0
#include <spdlog/spdlog.h>

int main(int argc, char *argv[])
{
    try
    {
        // Set the global logging level (Info, Warn, Error, Debug)
        spdlog::set_level(spdlog::level::info);

        // The io_context represents your program's link to the OS I/O services
        boost::asio::io_context io_context;
        GatewayServer server(io_context, 443);

        // Figure out how many CPU cores this server has (default to 4 if it can't tell)
        unsigned int cpu_cores = std::thread::hardware_concurrency();
        if (cpu_cores == 0)
            cpu_cores = 4;
        spdlog::info("Booting Gateway Thread Pool across {} CPU cores...", cpu_cores);

        // Create a pool of worker threads
        std::vector<std::thread> thread_pool;
        // Launch a thread for every CPU core, minus 1 (to leave the main thread free)
        for (unsigned int i = 0; i < cpu_cores - 1; ++i)
        {
            thread_pool.emplace_back([&io_context]()
                                     { io_context.run(); });
        }

        // The main thread also joins the work!
        io_context.run();

        // Wait for all threads to finish (this will only happen if the server shuts down)
        for (auto &t : thread_pool)
        {
            if (t.joinable())
            {
                t.join();
            }
        }
    }
    catch (std::exception &e)
    {
        spdlog::error("Fatal Server Exception: {}", e.what());
    }

    return 0;
}