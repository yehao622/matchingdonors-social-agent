#pragma once
#include <string>
#include <string_view>
#include <unordered_map>
#include <mutex>
#include <vector>
#include <hiredis/hiredis.h>

class SecurityEngine
{
private:
    std::unordered_map<std::string, int> request_counts_;
    std::mutex mutex_;

    // Dynamic variables
    int max_requests_;
    std::vector<std::string> malicious_signatures_;

    // The distributed database connection
    redisContext *redis_context_;

    void load_config(const std::string &config_file);

public:
    SecurityEngine(const std::string &config_file = "config.json");
    ~SecurityEngine();
    bool inspect_traffic(const std::string &ip_address, std::string_view payload);
};