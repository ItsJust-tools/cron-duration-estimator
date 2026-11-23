# Cron Duration Estimator

Converts cron schedules into estimated executions per hour, day, month and year to visualize job frequency and server load.

**Live:** [cron-duration-estimator.itsjust.tools](https://cron-duration-estimator.itsjust.tools)

## Features

- Parse and validate standard 5-field cron expressions with clear error messages
- Compute the next N run times from the current time with local timezone awareness
- Estimated runs per hour, day, week, month and year
- Handles `*` wildcards, comma lists, ranges (`1-15`) and steps (`*/5`, `1-15/2`) in every field
- Bar chart of the run distribution across hours of the day
- Highlight days of month that will never trigger (e.g. Feb 30)
- Copy the estimated run times and share the state via URL
- Presets for common schedules: every minute, hourly, daily, weekly and more
- 100% client-side — no data ever leaves your browser

## Keyboard shortcuts

| Key | Action           |
| --- | ---------------- |
| `C` | Copy estimate    |
| `X` | Clear expression |

## Development

```bash
npm install
npm run build -w @itsjust/core   # build shared core first
npm run dev
npm test
```

## Deployment

```bash
docker build -t itsjust-cron-duration-estimator .
docker run -p 3000:3000 itsjust-cron-duration-estimator
```

## License

MIT
