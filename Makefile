.PHONY: start-ai start-backend start-frontend start-dev

start-ai:
	@echo "Starting AI server"
	@cd ai-service && uv sync && uv run app.py

start-backend:
	@echo "Starting backend"
	@cd SkinProgress/SkinProgress && dotnet run

start-frontend:
	@echo "Starting frontend"
	@cd ui && npm install && npm run dev

start-dev:
	@cmd /c start cmd /k "title AI Server && cd ai-service && uv sync && uv run app.py"
	@cmd /c start cmd /k "title .NET Backend && cd SkinProgress/SkinProgress && dotnet run"
	@cmd /c start cmd /k "title React Frontend && cd ui && npm install && npm run dev"