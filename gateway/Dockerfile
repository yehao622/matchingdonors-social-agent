# Stage 1 - Builder
FROM ubuntu:22.04 AS builder

# Install C++ compilers, CMake and Boost
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libboost-all-dev

WORKDIR /src
COPY . .

# Build the C++ execution
RUN mkdir build && cd build && cmake .. && make

# Stage 2. Runner production image
FROM ubuntu:22.04 AS runner

RUN apt-get update && apt-get install -y libboost-system1.74.0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the compiled binary from the builder stage
COPY --from=builder /src/build/gateway /app/gateway

EXPOSE 8080

CMD ["./gateway"]
