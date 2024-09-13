hyperminimalist rss feed page
```
x- polls rss feeds at specified urls
x- generates and caches all pages as static, gzipped html
x- no endpoints trigger filesys i/o
x- no clientside javascript
```

![https://i.imgur.com/aKliYwJ.png](https://i.imgur.com/aKliYwJ.png)

`x- running:`

```bash
bun run start
// or
bun run index.ts
```
there is also an included Dockerfile

`x- configuration:`

the application generates a config file, and it's own .css for you after launching, which you are free to edit and restart to apply.
in addition it scans for a few environment variables which it will apply to the config (when it initializes it), more useful for docker setup
they are as follows:
```
PORT: port to host from
TITLE: main <h1> title text
DESCRIPTION: <h3> title subtext
POSTS_PER_PAGE: number of posts to limit to for creating pagination
FEEDS: comma seperated list of rss urls, must include https://
UPDATE_INTERVAL_MIN: how many minutes between updates - default 45
```
the application prefers values set in config.json. the exception is FEEDS, which if any additional sources are added to the environment variables they will be added at launch.

`x- etc.`

server maintains a file db.json.gz which is predictably a gzipped json string containing all posts it's come across
this is useful for rss feeds that only show X most recent posts. when configuring docker/hosting, may be pertinent to copy this as well as config.json and index.css between updates or over to new hosts.

ssrss was written on bun 1.1.27 and needs use of the http servers `static` to work. if you are getting the site online but it only returns 404 pages, it's likely your environment is using an out-of-date bun install
