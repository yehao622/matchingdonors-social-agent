#CMakeLists.txt
cmake_minimum_required(VERSION 3.14)
project(ZeroTrustGateway CXX)

#Modern C++ 17 
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

#Find Boost(Asio networking library)
find_package(Boost REQUIRED)

# Include the headers directory
include_directories(include)

#Add our excutable
add_executable(gateway 
    src/main.cpp 
    src/SecurityEngine.cpp 
    src/GatewayServer.cpp
)

#Link Boost libraries and threading
target_link_libraries(gateway Boost::boost pthread)