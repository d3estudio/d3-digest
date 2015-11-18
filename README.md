# Weekly Digest
Here at [D3 Estúdio](http://d3.do), Slack is our primary communication channel. Found a nice article? Slack. Found a cool gif? Slack. Want to spread the word about an event? Well, guess what? Slack.

We have been overusing the (relatively) new [Reactions](http://slackhq.com/post/123561085920/reactions) feature lately, and we stumbled on a nice idea: _Why not create a digest based on these reactions_?

Well, this is what **Weekly Digest** does: it watches channels through a bot and stores messages and their respective reactions.

## Installing

Installing it is pretty easy. You will need Node.js version 5.1.0 or upwards and NPM. Follow me:

1. Clone this repository and `cd` to it.
2. Install required dependencies through `npm install`
3. Head to https://my.slack.com/services/new/bot, create a new bot user and get its token
4. Run `script/bootstrap` at the repository root.
5. Edit `settings.json`. Insert your bot key value at the `token` key.
6. Run the watcher process through `script/watch`.
7. Profit!

## Configuration options
You can customize how your instance works and picks data by changing other configuration options on `settings.json`. See the list below:

 - `token`: `String`
   - Your Slack Bot token key.
   - Defaults to `''`.
 - `messageMatcherRegex`: `String`
   - Regex value used to detect which messages should be watched.
   - Defaults to `/\b(http|https)?(:\/\/)?(\S*)\.(\w{2,4})\b/ig`.
   - Please see the [notes](#notes) for more information about this field.
 - `channels`: `[String]`
   - List of channels to be watched.
   - Defaults to `['random']`.
 - `loggerLevel`: `String`
   - Logging output level. Valid values are `silly`, `verbose`, `info`, `warn` and `error`.
   - Defaults to `info`.
 - `autoWatch`: `Boolean`
   - Defines whether new channels should be automatically watched. When set to `true`, any channel that the bot is invited to will automatically be inserted to the `channels` list, and your `settings.json` file will be overwritten with the new contents.
   - Defaults to `false`

## Parsing

*Coming soon*

### Notes

#### What about `messageMatcherRegex`?
Well, we can't actually represent an Regular Expression in JSON, you know, and the one we use by default requires more than one argument to the `RegExp` constructor, but well, we kinda sorted it out. If you intend to use a Regular Expression that replaces the content rather than just matching them, please prepend it with `__SERIALIZED_REGEX`, so it will be like this in the JSON file:

```json
{
    "messageMatcherRegex": "__SERIALIZED_REGEX /\\b(http|https)?(:\\/\\/)?(\\S*)\\.(\\w{2,4})\\b/gi"
}
```

You will notice that if `autoWatch` is turned on and your bot is invited to a new channel, your settings file will reappear with this new key. Fear not! Everything will be okay.

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
