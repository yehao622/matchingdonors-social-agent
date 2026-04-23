#include "../include/SecurityEngine.hpp"
#include <iostream>

SecurityEngine::SecurityEngine() : malicious_signatures_{
                                       "DROP TABLE", "<script>", "UNION SELECT", "HACKER_ATTACK"} {}

bool SecurityEngine::inspect_traffic(const std::string &ip_address, std::string_view payload)
{
    std::lock_guard<std::mutex> lock(mutex_);

    request_counts_[ip_address]++;
    if (request_counts_[ip_address] > MAX_REQUESTS)
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