# Anime Dataset Structure

This document describes the structure of the anime dataset.

---

## Main Dataset (`data/anime_data.csv`)

The dataset contains detailed information about anime titles sourced from MyAnimeList. Below is the description of each column:

| **Column**         | **Description**                                                                 |
|---------------------|---------------------------------------------------------------------------------|
| `anime_id`         | Unique identifier for each anime, assigned by MyAnimeList.                     |
| `title`            | Official anime title.                                                         |
| `english_title`    | Official English title, if available.                                          |
| `japanese_title`   | Original Japanese title.                                                      |
| `type`             | Format of the anime (e.g., TV, Movie, OVA, Special).                          |
| `episodes`         | Total number of episodes.                                                     |
| `duration`         | Average duration of an episode (e.g., "24 min per ep").                       |
| `status`           | Current status of the anime (e.g., Finished Airing, Currently Airing).         |
| `source`           | Origin of the story (e.g., Manga, Light Novel, Original).                     |
| `season`           | Season and year of release (e.g., "Fall 2023").                               |
| `studios`          | List of animation studios responsible for production.                         |
| `genres`           | Comma-separated list of genres associated with the anime (e.g., "Action, Drama"). |
| `rating`           | Content rating (e.g., "PG-13", "R+").                                         |
| `score`            | Average user rating (on a scale of 1 to 10).                                  |
| `scored_by`        | Number of users who rated the anime.                                           |
| `rank`             | Global ranking of the anime based on its score.                               |
| `popularity`       | Popularity rank based on user interest.                                       |
| `members`          | Total number of users who added the anime to their list.                      |
| `favorites`        | Number of users who marked the anime as a favorite.                           |
| `watching`         | Number of users currently watching the anime.                                 |
| `completed`        | Number of users who have completed the anime.                                 |
| `on_hold`          | Number of users who paused watching the anime.                                |
| `dropped`          | Number of users who have dropped the anime.                                   |
| `plan_to_watch`    | Number of users planning to watch the anime.                                  |
| `start_date`       | Airing start date (format: `YYYY-MM-DD`).                                     |
| `end_date`         | Airing end date (format: `YYYY-MM-DD` or null).                               |
| `broadcast_day`    | Day of the week the anime aired (e.g., "Friday").                             |
| `broadcast_time`   | Time of broadcast (e.g., "24:00 JST").                                        |
| `synopsis`         | Brief summary or description of the anime's plot.                             |

---

## Notes

- **Null Values**:
  - Some fields, such as `english_title` or `end_date`, may contain null values if the information is unavailable.
- **Date Format**:
  - Dates are stored in the standard format `YYYY-MM-DD`.
- **Genre and Studios**:
  - These fields contain comma-separated values.
- **Dynamic Rankings**:
  - Rankings (`rank`, `popularity`) may change over time as data on MyAnimeList updates.

---
