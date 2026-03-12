# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Calendar Assistant — a web-based AI-powered calendar assistant with voice interaction, Google Calendar management, and smart scheduling recommendations. Currently in early-stage setup (Sprint 1 began Feb 8, 2026).

## Planned Architecture

Microservices architecture with three main components:

- **Frontend** — React or Vue.js chat UI with voice input (Web Speech API), PWA capabilities
- **Agent Server** — Core AI microservice (Node.js/Express or Flask) handling chat (OpenAI/Groq), Google Calendar CRUD, reminders, and external API integrations (Google Maps, OpenWeather, Twilio)
- **General Request Service** — Second microservice for non-chat operations (history saving, general responses), communicates with Agent Server via gRPC/HTTP
- **Database** — MongoDB for conversation history
- **Containerization** — Docker + Docker Compose for local dev, cloud deployment (Heroku/AWS)

## Git Workflow

- Main branch: `main`
- Branch naming follows Jira ticket convention: `SCRUM-{ticket#}-description`
- Commit messages reference Jira tickets (e.g., `SCRUM-13`)
- PRs go through team code review before merge
- Repository: https://github.com/quang2598/ai-calendar-assistant.git

## Team

3-person team: 1 front-end, 1 back-end, 1 full-stack/DevOps. Agile/Scrum with 2-week sprints, velocity of 10 story points/sprint.
