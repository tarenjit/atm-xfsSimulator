// mini_json.h — header-only JSON builder + tiny parser.
//
// Scope: only what the WFS codec needs — object/array/string/number/bool/null.
// This keeps the DLL dependency-free; no nlohmann/json, no rapidjson.
// Not a general-purpose parser — explicitly does NOT handle \uXXXX escapes
// (not needed for XFS payloads which are pure ASCII) or advanced number
// formats beyond integers and simple decimals.

#pragma once

#include <cstdint>
#include <cstdio>
#include <sstream>
#include <string>
#include <vector>

namespace zegen::json {

// ----- Builder: compose JSON strings fluently -----
class Writer {
public:
    Writer() { out_ << "{"; }

    Writer& key(const std::string& k) {
        if (!first_) out_ << ",";
        first_ = false;
        out_ << "\"" << escape(k) << "\":";
        return *this;
    }
    Writer& value(const std::string& v) { out_ << "\"" << escape(v) << "\""; return *this; }
    Writer& value(const char* v)        { return value(std::string(v ? v : "")); }
    Writer& value(int32_t v)            { out_ << v; return *this; }
    Writer& value(uint32_t v)           { out_ << v; return *this; }
    Writer& value(int64_t v)            { out_ << v; return *this; }
    Writer& value(bool v)               { out_ << (v ? "true" : "false"); return *this; }
    Writer& null_()                     { out_ << "null"; return *this; }
    Writer& raw(const std::string& s)   { out_ << s; return *this; }

    Writer& begin_array() { out_ << "["; first_ = true; depth_.push_back(true); return *this; }
    Writer& end_array()   { out_ << "]"; depth_.pop_back(); first_ = depth_.empty() ? false : depth_.back(); return *this; }

    std::string str() { out_ << "}"; return out_.str(); }

private:
    std::ostringstream out_;
    bool first_ = true;
    std::vector<bool> depth_;

    static std::string escape(const std::string& s) {
        std::string out;
        out.reserve(s.size());
        for (char c : s) {
            switch (c) {
                case '"':  out += "\\\""; break;
                case '\\': out += "\\\\"; break;
                case '\n': out += "\\n";  break;
                case '\r': out += "\\r";  break;
                case '\t': out += "\\t";  break;
                default:   out += c;
            }
        }
        return out;
    }
};

// ----- Parser: field lookup on a flat JSON string -----
//
// Intentionally minimal. Given a JSON body, find top-level / nested fields
// by a dotted path like "payload.pan" or "mix.100000". Returns the raw
// value text between the first quotes (for strings) or the literal token
// (for numbers / bools / null). For arrays use `array_element(body, path, idx)`.
//
// NOT a structural validator. Callers should call `has_field` before
// `get_string` / `get_number` if they need to discriminate "missing" from
// "empty string".

class Reader {
public:
    explicit Reader(const std::string& body) : body_(body) {}

    bool has_field(const std::string& path) const {
        size_t p = find_field_start(path);
        return p != std::string::npos;
    }

    std::string get_string(const std::string& path) const {
        size_t p = find_field_start(path);
        if (p == std::string::npos) return {};
        // Expect '"' next.
        if (p >= body_.size() || body_[p] != '"') return {};
        size_t end = p + 1;
        while (end < body_.size()) {
            if (body_[end] == '\\' && end + 1 < body_.size()) { end += 2; continue; }
            if (body_[end] == '"') break;
            ++end;
        }
        return unescape(body_.substr(p + 1, end - p - 1));
    }

    int64_t get_int(const std::string& path, int64_t fallback = 0) const {
        size_t p = find_field_start(path);
        if (p == std::string::npos) return fallback;
        return std::atoll(body_.c_str() + p);
    }

    bool get_bool(const std::string& path, bool fallback = false) const {
        size_t p = find_field_start(path);
        if (p == std::string::npos) return fallback;
        return body_.compare(p, 4, "true") == 0;
    }

private:
    const std::string& body_;

    // Find the position where the VALUE of `path` starts (just after the ':'
    // and any whitespace). Supports nested paths via dots.
    size_t find_field_start(const std::string& path) const {
        size_t cursor = 0;
        size_t dot = 0;
        while (dot != std::string::npos) {
            size_t next_dot = path.find('.', dot);
            std::string segment = path.substr(dot, next_dot == std::string::npos
                                                     ? std::string::npos
                                                     : next_dot - dot);
            std::string needle = std::string("\"") + segment + "\":";
            size_t at = body_.find(needle, cursor);
            if (at == std::string::npos) return std::string::npos;
            cursor = at + needle.size();
            // Skip whitespace.
            while (cursor < body_.size() && (body_[cursor] == ' ' ||
                   body_[cursor] == '\t' || body_[cursor] == '\n')) ++cursor;
            if (next_dot == std::string::npos) return cursor;
            // Traverse into the nested object.
            if (cursor < body_.size() && body_[cursor] == '{') ++cursor;
            dot = next_dot + 1;
        }
        return std::string::npos;
    }

    static std::string unescape(const std::string& s) {
        std::string out;
        out.reserve(s.size());
        for (size_t i = 0; i < s.size(); ++i) {
            if (s[i] == '\\' && i + 1 < s.size()) {
                switch (s[i + 1]) {
                    case '"':  out += '"';  break;
                    case '\\': out += '\\'; break;
                    case 'n':  out += '\n'; break;
                    case 'r':  out += '\r'; break;
                    case 't':  out += '\t'; break;
                    default:   out += s[i + 1]; break;
                }
                ++i;
            } else {
                out += s[i];
            }
        }
        return out;
    }
};

} // namespace zegen::json
