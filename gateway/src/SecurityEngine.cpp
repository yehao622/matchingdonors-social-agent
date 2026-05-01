#include "../include/SecurityEngine.hpp"
#include <fstream>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

using json = nlohmann::json;

SecurityEngine::SecurityEngine(const std::string &config_file)
{
    load_config(config_file);

    // --- CONNECT TO REDIS ---
    const char *env_redis = std::getenv("REDIS_HOST");
    std::string redis_host = env_redis ? env_redis : "localhost";
    redis_context_ = redisConnect(redis_host.c_str(), 6379);

    if (redis_context_ != nullptr && redis_context_->err)
    {
        spdlog::error("❌ Redis Connection Error: {}", redis_context_->errstr);
    }
    else
    {
        spdlog::info("✅ Connected to Distributed Redis Cache at {}", redis_host);
    }
}

SecurityEngine::~SecurityEngine()
{
    if (redis_context_ != nullptr)
    {
        redisFree(redis_context_);
    }
}

void SecurityEngine::load_config(const std::string &config_file)
{
    try
    {
        std::ifstream file(config_file);
        if (!file.is_open())
        {
            spdlog::error("⚠️ Could not open {}. Using default failsafe WAF rules.", config_file);
            max_requests_ = 5;
            malicious_signatures_ = {"DROP TABLE", "<script>"};
            return;
        }

        json config;
        file >> config;

        max_requests_ = config["waf"]["max_requests_per_minute"];
        malicious_signatures_ = config["waf"]["malicious_signatures"].get<std::vector<std::string>>();

        spdlog::info("✅ WAF Configuration loaded dynamically from {}.", config_file);
        spdlog::info("🛡️ Tracking {} threat signatures.", malicious_signatures_.size());
    }
    catch (const std::exception &e)
    {
        spdlog::error("❌ Fatal Error Parsing JSON: {}", e.what());
    }
}

bool SecurityEngine::inspect_traffic(const std::string &ip_address, std::string_view payload)
{
    std::lock_guard<std::mutex> lock(mutex_);

    // Distributed rate limiter
    if (redis_context_ != nullptr && !redis_context_->err)
    {
        std::string redis_key = "rate_limit:" + ip_address;

        // Increment the counter for this IP
        redisReply *reply = (redisReply *)redisCommand(redis_context_, "INCR %s", redis_key.c_str());

        if (reply != nullptr)
        {
            int current_count = reply->integer;
            freeReplyObject(reply);

            if (current_count == 1)
            {
                redisReply *expire_reply = (redisReply *)redisCommand(redis_context_, "EXPIRE %s 60", redis_key.c_str());
                if (expire_reply)
                    freeReplyObject(expire_reply);
            }

            if (current_count > max_requests_)
            {
                spdlog::warn("🚨 [WAF BLOCKED] Distributed Rate limit exceeded for IP: {}", ip_address);
                return false;
            }
        }
    }
    else
    {
        spdlog::error("⚠️ Redis unavailable! Failing open (allowing traffic) but losing rate tracking.");
    }

    for (const auto &signature : malicious_signatures_)
    {
        if (payload.find(signature) != std::string_view::npos)
        {
            spdlog::warn("🚨 [WAF BLOCKED] Malicious payload '{}' detected from IP: {}", signature, ip_address);
            return false;
        }
    }
    return true;
}