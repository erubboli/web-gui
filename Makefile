.PHONY: up down restart-gui build logs dev dev-indexer dev-build wallet-cli

## Start all services
up:
	docker compose up -d

## Stop and remove all containers (including optional profiles and orphaned run containers)
down:
	docker compose --profile indexer --profile wallet_cli down --remove-orphans

## Rebuild and restart only the web-gui container
restart-gui:
	docker compose up -d --build web-gui

## Rebuild all images without starting
build:
	docker compose build

## Tail logs for all services (Ctrl+C to stop)
logs:
	docker compose logs -f

## Start web-gui in dev mode with HMR (node+wallet daemons still use prod images)
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up web-gui

## Start web-gui in dev mode with HMR + indexer stack
dev-indexer:
	docker compose --profile indexer -f docker-compose.yml -f docker-compose.dev.yml up web-gui postgres api-blockchain-scanner-daemon api-web-server

## Rebuild dev image (run after adding npm packages)
dev-build:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml build web-gui

## Open an interactive wallet-cli session connected to the running wallet-rpc-daemon
wallet-cli:
	docker compose --profile wallet_cli run --rm wallet-cli
