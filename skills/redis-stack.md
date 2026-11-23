---
name: redis-stack
description: Start Redis Stack locally in Docker, with RedisInsight on port 8001
---
1. Run `docker ps -a --filter name=redis-stack` to see if the container already exists.
2. If it exists but is stopped, start it with `docker start redis-stack`.
3. If it doesn't exist, use docker_run with image `redis/redis-stack:latest`, name `redis-stack`, ports `6379:6379` and `8001:8001`.
4. If Docker isn't running, open it with open_app("docker"), wait for `docker info` to succeed, then retry once.
5. Tell the user Redis is on localhost:6379 and RedisInsight is at http://localhost:8001.
