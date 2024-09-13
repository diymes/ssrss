import { env, gunzipSync, gzipSync, type Server } from "bun"

class DB {
  posts: Post[] = []
  last_update: Date = new Date()
}

class Conf {
  port: number = parseInt(env.PORT? env.PORT : '8080')
  title: string = env.TITLE? env.TITLE : "RSS Feed"
  description: string = env.DESCRIPTION? env.DESCRIPTION : "RSS Feed Page"
  posts_per_page: number = env.POSTS_PER_PAGE? parseInt(env.POSTS_PER_PAGE) : 32
  feeds: string[] = env.FEEDS? env.FEEDS.replaceAll(/\r?\n|\r/g, '').split(',') : []
  update_interval_min: number = env.UPDATE_INTERVAL_MIN? parseInt(env.UPDATE_INTERVAL_MIN) : 15

  static async getDefaultConfig() {
    let config = new Conf();
    //check if config file exists
    if (await Bun.file('./config.json').exists()) {
      let c = await Bun.file('./config.json').json()
      if (c !== config) {
        for (let key in c) {
          // @ts-ignore
          config[key] = c[key]
        }
        let sources = env.FEEDS? env.FEEDS.split(',') : []
        // get env var sources
        for (let source of sources) {
          if (config.feeds.indexOf(source) === -1) {
            config.feeds.push(source)
          }
        }
        await Bun.write('./config.json', JSON.stringify(config))
      }
    } else {
      await Bun.write('./config.json', JSON.stringify(config))
    }

    return config
  }
}

type Post = {
  title: string
  link: string
  date: Date
  site: string
}

// #region css
let css = `
html {
  font-family: monospace;
  background-color: #161718;
  color: #f8fbfa;
  font-weight: 500;
  display: flex;
  justify-content: space-around;
}

h1, h3 {
  background-color: #faa8b4;
  padding: 4px;
  text-align: right;
}

body {
  width: 900px;
}

p {
  margin: 0.5em 0;
}

li a {
  font-size: 120%;
  color: #faa8b4;
}

a:hover {
  color: #dcab88;
}

a:visited {
  color: #cea07f;
}

ul {
  padding: 0;
}

li {
  list-style-type: none;
}

li p {
  color: #f8fbfac0;
}

hr {
  border: 1px solid #f8fbfa20;
}

li p a, li p a:visited, a {
  color: #faa8b4d0;
  font-size: 100%;
}
`
// #endregion

// #region html template
/**
 * generates the html template for section of a given feed
 * requires providing pagination information
 * @param feed 
 * @param page 
 * @param total_pages 
 * @returns string: built html template
 */
function template(feed: Post[], page: number, total_pages: number = 0) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.title}</title>
    <link rel="stylesheet" href="/css">
  </head>

  <body>
    <h1>${config.title}</h1>
    <h3>${config.description}</h3>
    <ul>
      ${
        feed.map((post) => `
          <li>
          <a href="${post.link}">${post.title}</a>
          <p>${post.date.toLocaleDateString()} | <a href="https://${post.site}">${post.site}</a> <a href="/${post.site}">→</a></p>
          <hr>
          </li>
        `).join('')
      }
    </ul>
    <p>${page > 0 ? `<a href="/${page - 1}"><==</a>` : ''} ${page}/${total_pages} ${page < total_pages ? `<a href="/${page + 1}">==></a>` : ''}</p>

  </body>
</html>
  `
}
// #endregion

// #region application logic
let entityMap: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};
function escapeHtml (string: string) {
  return String(string).replace(/[<>"'`=\/]/g, function (s) {
    return entityMap[s];
  });
}

/**
 * get the feed from a given url, parse xml and sanitize
 * @param url 
 * @returns 
 */
async function getFeed(url: string): Promise<Post[]> {
  let site = /https:\/\/([\s\S]*?)\//.exec(url)?.[1]
  if (!site) {
    console.log(`no posts found for ${url}`)
    return []
  }
  let response
  try {
    response = await fetch(url)
  } catch (e) {
    console.log(`no posts found for ${url}`)
    return []
  }
  const text = (await response.text())
    .replaceAll('<entry>', '<item>')
    .replaceAll('</entry>', '</item>')
    .replaceAll('<id>', '<link>')
    .replaceAll('</id>', '</link>')
    .replaceAll('<updated>', '<pubDate>')
    .replaceAll('</updated>', '</pubDate>')

  let feed: Post[] = []

  // parse xml regex
  const regex = /<item>([\s\S]*?)<\/item>/g

  let matches = text.match(regex)
  if (matches) {
    matches.forEach((match) => {
      let title = /<title>([\s\S]*?)<\/title>/.exec(match)?.[1]

      if (title && title.includes('CDATA')) {
        title = title.replace('<![CDATA[', '').replace(']]>', '')
      }
      let link = /<link>([\s\S]*?)<\/link>/.exec(match)?.[1]
      let date = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(match)?.[1]

      if (!title || !link || !date || !site) {
        console.log(`xml parsing error for ${url}`)
        return []
      }
      
      //sanitize
      title = escapeHtml(title)
      link = escapeHtml(link)
      date = escapeHtml(date)

      let d = new Date(date)

      feed.push({
          title: title,
          link: link,
          date: d,
          site: site
      })
    })
  }

  return feed
}

/**
 * generate static pages for caching
 * @returns 
 */
async function generate_static(): Promise<Record<`/${string}`, Response>> {
  let db = new DB()
  if (await Bun.file('./db.json.gz').exists()) {
    let txt = gunzipSync(await Bun.file('./db.json.gz').bytes())
    let str = new TextDecoder().decode(txt)
    db = JSON.parse(str)
    for (let p of db.posts) {
      // convert string to date
      p.date = new Date(p.date)
    }
  }

  let pages: Record<`/${string}`, Response> = {}

  if (await Bun.file('./index.css').exists()) {
    css = await Bun.file('./index.css').text()
  } else {
    await Bun.write('./index.css', css)
  }
  pages['/css'] = new Response(gzipSync(css), {headers: {'Content-Type': 'text/css', 'Content-Encoding': 'gzip'}})

  let feed: Post[] = db.posts

  let awaits: Promise<Post[]>[] = []
  for (let url of config.feeds) {
    awaits.push(getFeed(url))
  }

  await Promise.all(awaits).then(async (blogs) => {
    for (let blog of blogs) {
      if (blog.length === 0) {
        continue
      }
      blog = blog.sort((a, b) => b.date.getTime() - a.date.getTime())
      let page = blog[0].site
      let html = gzipSync(template(blog, 0, 0))
      pages[`/${page}`] = new Response(html, {headers: {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'}})
  
      for (let post of blog) {
        if (feed.findIndex((p) => p.link == post.link) === -1) {
          feed.push(post)
        }
      }
      db.posts = feed
      db.last_update = new Date()
      await Bun.write('./db.json.gz', gzipSync(JSON.stringify(db)))
      console.log(`total posts: ${feed.length}`)
    }
  })

  feed.sort((a, b) => b.date.getTime() - a.date.getTime())

  let total_pages = Math.floor(feed.length / config.posts_per_page)

  for (let i = 0; i < Math.ceil(feed.length / config.posts_per_page); i++) {
    let html = gzipSync(template(feed.slice(i * config.posts_per_page, (i + 1) * config.posts_per_page), i, total_pages))
    pages[`/${i}`] = new Response(html, {headers: {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'}})
  }

  let html = gzipSync(template(feed.slice(0, config.posts_per_page), 0, total_pages))
  pages[`/`] = new Response(html, {headers: {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'}})

  return pages
}
// #endregion

// server initialization
// 
let server: Server
let config: Conf = await Conf.getDefaultConfig()

async function init() {
  let pages = await generate_static()
  return Bun.serve({
    static: pages,
    port: config.port,
    async fetch(req) {
      return new Response("404!", {status: 404});
    },
  });
}

// start server
server = await init()

// queue update job
setInterval(async () => {
  console.log('Updating feed...')
  let static_pages = await generate_static()

  server.reload({
    static: static_pages,
    port: config.port,
    async fetch(req) {
      return new Response("404!", {status: 404});
    },
  })

}, config.update_interval_min * 60 * 1000)

console.log(`Server running on http://localhost:${config.port}`);
