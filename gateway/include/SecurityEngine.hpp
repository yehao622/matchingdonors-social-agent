#pragma once
#include <string>
#include <string_view>
#include <unordered_map>
#include <mutex>
#include <vector>

class SecurityEngine
{
private:
    std::unordered_map<std::string, int> request_counts_;
    std::mutex mutex_;

    // Dynamic variables
    int max_requests_;
    std::vector<std::string> malicious_signatures_;
    void load_config(const std::string &config_file);

public:
    SecurityEngine(const std::string &config_file = "config.json");
    bool inspect_traffic(const std::string &ip_address, std::string_view payload);
};