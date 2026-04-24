#include "../include/SecurityEngine.hpp"
#include <iostream>
#include <fstream>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

SecurityEngine::SecurityEngine(const std::string &config_file)
{
    load_config(config_file);
}

void SecurityEngine::load_config(const std::string &config_file)
{
    try
    {
        std::ifstream file(config_file);
        if (!file.is_open())
        {
            std::cerr << "⚠️ Could not open " << config_file << ". Using default failsafe WAF rules.\n";
            max_requests_ = 5;
            malicious_signatures_ = {"DROP TABLE", "<script>"};
            return;
        }

        json config;
        file >> config;

        max_requests_ = config["waf"]["max_requests_per_minute"];
        malicious_signatures_ = config["waf"]["malicious_signatures"].get<std::vector<std::string>>();

        std::cout << "✅ WAF Configuration loaded dynamically from " << config_file << "\n";
        std::cout << "🛡️ Tracking " << malicious_signatures_.size() << " threat signatures.\n";
    }
    catch (const std::exception &e)
    {
        std::cerr << "❌ Fatal Error Parsing JSON: " << e.what() << "\n";
    }
}

bool SecurityEngine::inspect_traffic(const std::string &ip_address, std::string_view payload)
{
    std::lock_guard<std::mutex> lock(mutex_);

    request_counts_[ip_address]++;
    if (request_counts_[ip_address] > max_requests_)
    {
        std::cerr << "🚨 [WAF BLOCKED] Rate limit exceeded for IP: " << ip_address << "\n";
        return false;
    }

    for (const auto &signature : malicious_signatures_)
    {
        if (payload.find(signature) != std::string_view::npos)
        {
            std::cerr << "🚨 [WAF BLOCKED] Malicious payload '" << signature
                      << "' detected from IP: " << ip_address << "\n";
            return false;
        }
    }
    return true;
}