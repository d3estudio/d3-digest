# D3 Digest

<p align="center">
   <a href="https://travis-ci.org/d3estudio/d3-digest"><img src="https://img.shields.io/travis/d3estudio/d3-digest.svg" alt="Build Status"></a>
   <img src="https://img.shields.io/david/d3estudio/d3-digest.svg" alt="Dependency status" />
   <img alt="Language" src="https://img.shields.io/badge/language-JS6-yellow.svg" />
   <img alt="Platform" src="https://img.shields.io/badge/platform-NodeJS-brightgreen.svg" />
   <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
</p>


Here at [D3 Estúdio](http://d3.do), Slack is our primary communication channel. Found a nice article? Slack. Found a cool gif? Slack. Want to spread the word about an event? Well, guess what? Slack.

We have been overusing the (relatively) new [Reactions](http://slackhq.com/post/123561085920/reactions) feature lately, and we stumbled on a nice idea: _Why not create a digest based on these reactions_?

Well, this is what **D3 Digest** does: it watches channels through a bot and stores messages and their respective reactions.

## Installing

The development environment is managed by [Azk](http://azk.io), which handles Docker and VirtualBox in order to keep everything running smoothly. To get up and running on your machine, follow these steps:

   1. Download and install [Docker Toolbox](https://www.docker.com/docker-toolbox).
   2. Install [Azk](http://docs.azk.io/en/installation/)
   3. Clone this repo and `cd` into it.
   4. Run `script/bootstrap`, which will create your `settings.json` file.
      1. Head to [Slack Team Customization Page](http://my.slack.com/services/new/bot) and create a new bot and get its token.
      2. Fill the `token` property on the recently-generated `settings` file.
   5. Start applications you want:
      1. To start the `watcher` process, that connects to Slack and watches predefined channels (please refer to the list below), run `azk start watcher`.
      2. To start the `web` process, that allows you to see collected links and reactions, run `azk start web`.
   6. To check system status, use `azk status`. This command will also shows hostnames and ports.

> **Note**: You can also open the web application by running `azk open web`.


## Configuration options
You can customize how your instance works and picks data by changing other configuration options on `settings.json`. See the list below:

 - `token`: `String`
   - Your Slack Bot token key.
   - Defaults to `''`.
 - `channels`: `[String]`
   - List of channels to be watched.
   - Defaults to `['random']`.
 - `loggerLevel`: `String`
   - Logging output level. Valid values are `silly`, `verbose`, `info`, `warn` and `error`.
   - Defaults to `info`.
 - `autoWatch`: `Boolean`
   - Defines whether new channels should be automatically watched. When set to `true`, any channel that the bot is invited to will automatically be inserted to the `channels` list, and your `settings.json` file will be overwritten with the new contents.
   - Defaults to `false`
 - `silencerEmojis`: `[String]`
   - Do not parse links containing the specified emoji. Please notice that this removes the link from the parsing process, which means that the link will be stored, even if a valid "silencer emoji" is used as a reaction.
   - Defaults to `['no_entry_sign']`
 - `twitterConsumerKey`: `String`
   - Used by the Twitter parsing plugin to expand twitter urls into embeded tweets. To use this, register a new Twitter application and provide your API key in this field. When unset, the Twitter parsing plugin will refuse to expand twitter urls.
   - Defaults to `undefined`
 - `twitterConsumerSecret`: `String`
   - Required along with `twitterConsumerKey` by the Twitter parsing plugin, if you intend to use it. Please provide your API secret in this field.
   - Defaults to `undefined`
 - `mongoUrl`: `String`
   - URL to your local Mongo instance, used to store links and reactions.
   - Defaults to `mongodb://localhost:27017/digest`
 - `memcachedHost`: `String`
   - IP to local Memcached server. This is used to store processed links, like its metadata or HTML content. Notice that, although this is not required, it will improve drastically the time required by the web interface to load and show the items.
   - Defaults to `127.0.0.1`
 - `memcachedPort`: `String` or `Number`
   - Port where your Memcached server is running.
   - Defaults to `11211`
 - `outputDayRange`: `Number`
   - Range of days to gather links from. This is used by the web interface to paginate requests for links.
   - Defaults to `1`.
 - `timezone`: `String`
   - Timezone of your Slack team.
   - Defaults to `America/Sao_Paulo`
 - `showLinksWithoutReaction`: `Boolean`
   - Defines the behaviour of the web interface regarding collected links without reactions. When set to `true`, links without reactions will also be shown on the web interface.
   - Defaults to `false`

# API

The web server exposes an API that allows the frontend to get links and reactions. The server actually exposes two endpoints:

 - `/api/latest`
 - `/api/from/<int>`

Calling any of the listed endpoints will result in the same kind of response, which will have the following structure:

 - `from` and `until`: Used when querying the database, defines the range of time that composes the resulting `items` object. `from` must be used to future calls to `/api/from`, being passed to the `<int>` parameter.
 - `items`: See next topic.

## `items`
The `items` property exposes informations about users who sent links, and their respective links. Available properties are:

 - `users`: `Array` of `Object`s. Contains all users who contributed to the generated digest.
 - `items`: `Array` of `Object`s. The parsed links.
 - `itemsForUser`: `Object`. Maps every item in `items` to its respective `user`.

## `users`
An `User` object contains information a given user that combributed to the generated digest. Useful if you intend to
make an index. Each object contains the following fields:

 - `real_name`: Full user's name.
 - `username`: Slack username of the user.
 - `image`: Slack avatar of the user.
 - `title`: Slack title. Usually people fill this field with what they do in your company/group.
 - `emojis`: List of emoji used in reactions to posts made by this user.

## `items`
An `Item` represents a link posted to a watched channel. Its contents depends on which plugin parsed the link, but common keys are:

 - `type`: String representing the resulting item type. You can find a list of builtin types below.
 - `user`: `User` that posted this item
 - `reactions`: Array containing a list of reactions received by this post. Each item have the following structure:
   - `name`: Emoji name used on the reaction.
   - `count`: Number of times the item received this reaction.
 - `totalReactions`: Sum of the reactions amount received by this item.
 - `date`: Date this item was posted relative to Unix Epoch.
 - `channel`: Name of the channel that this item was found.
 - `id`: Unique identifier of this item.

### Item type: `youtube`
The item was detected as an YouTube video. In this case, the following keys might be found:

 - `title`: Video title
 - `html`: HTML used to display the embeded video.
 - `thumbnail_height`: Height, in pixels, of the video's thumbnail.
 - `thumbnail_width`: Width, in pixels, of the video's thumbnail.
 - `thumbnail_url`: Url pointing to the video's thumbnail.

### Item type: `vimeo`
Same as `youtube`, with one more property:

 - `description`: Video description

### Item type: `xkcd`
Represents an XKCD comic. Keys are:

 - `img`: URL of the comic image.
 - `title`: Comic title
 - `link`: Link to the original comic post.

### Item type: `tweet`
Represents a tweet. Keys are:

 - `html`: HTML used to display the embeded tweet. This also includes javascript, directly from Twitter.

> **Note**: The Twitter plugin requires certain configuration properties to be set. Please refer to the [Configuration Options](#configuration-options) section for more information.

### Item type: `spotify`
Represents a Spotify album, song, artist or playlist. Keys are:

 - `html`: HTML used to display the embeded spotify player.

### Item type: `rich-link`
Represents a link that has does not match any other plugin and had its OpenGraph details extracted. Keys are:

 - `title`: Page title or OpenGraph item name
 - `summary`: Page description or OpenGraph item description
 - `image`: Image representing the item, or, the first image found in the page
 - `imageOrientation`: Is this image vertical or horizontal? It matters, you see.

> **Note**: To learn more about OpenGraph, refer to the [OpenGraph Protocol Official Website](http://ogp.me).

### Item type: `poor-link`
This is a special item kind, that represents an object that could not be parsed by any of the available plugins. Its keys are:

 - `url`: Item URL.
 - `title`: Item title.

----

# License

```
The MIT License (MIT)

Copyright (c) 2015 D3 Estúdio

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
