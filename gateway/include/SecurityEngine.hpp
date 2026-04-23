#pragma once
#include <string>
#include <string_view>
#include <unordered_map>
#include <mutex>
#include <array>

class SecurityEngine
{
private:
    std::unordered_map<std::string, int> request_counts_;
    std::mutex mutex_;
    const int MAX_REQUESTS = 5;
    std::array<std::string_view, 4> malicious_signatures_;

public:
    SecurityEngine();
    bool inspect_traffic(const std::string &ip_address, std::string_view payload);
};