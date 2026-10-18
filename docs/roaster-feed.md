# Roaster feed

A roaster feed is one JSON file listing every coffee a roaster has published an
xBloom recipe for. An XBRW++ import link can point at it, and the app then offers
to subscribe to that roaster. Subscribing adds the roaster to the catalogue: the
user can browse its coffees, open one, and brew it, add it to their library or
put it on a shelf. Subscribing adds nothing to the library by itself.

Any roaster can publish one. This page is the contract.

## Pointing a link at it

Add `feed` to an ordinary import link (see
`docs/superpowers/specs/2026-09-28-brewmind-integration-design.md`):

```
xbrw://import?v=1&source=<your name>&feed=<https URL of the feed, percent-encoded>&share=<xBloom share URL>&bean.name=...
```

- `feed` must be `https` and at most 2,000 characters. Anything else is ignored.
- The link's own recipe always imports first, exactly as it would without `feed`.
  Older builds ignore the parameter.
- The offer is made after that import, once the person is back in their library:
  "Subscribe to {roaster}?". It is not made if they already subscribe (the app
  refreshes the catalogue quietly instead) or if they ticked "Don't ask again".
- A feed is identified by its origin and path. The query string is ignored, so
  `?view=xbrw&v=2` is the same feed as `?view=xbrw`.

## The file

Serve it over https. Any content type works: the body is parsed as JSON whatever
the response says it is, because some shop platforms can only serve `text/html`.

```json
{
  "version": 1,
  "roaster": {
    "name": "Central Coast Coffee",
    "url": "https://www.centralcoastcoffee.com.au",
    "feed": "https://www.centralcoastcoffee.com.au/collections/roasted-coffee-beans?view=xbrw"
  },
  "coffees": [
    {
      "id": "peru-el-palto-gesha-washed",
      "name": "Peru | El Palto | Gesha Washed",
      "url": "https://www.centralcoastcoffee.com.au/products/peru-el-palto-gesha-washed",
      "available": true,
      "image": "https://cdn.example/peru.png",
      "recipes": [
        {"size": "18g", "share": "https://share-h5.xbloom.com/?id=..."},
        {"size": "15g", "share": "https://share-h5.xbloom.com/?id=..."}
      ],
      "roast": {"level": "Nordic Ultra-light", "rest_days": 14, "peak_day": 35, "best_until_day": 52},
      "bag_sizes_g": [1000, 480, 320, 160],
      "bean": {
        "roaster": "Central Coast Coffee",
        "country": "Peru",
        "region": "Cajamarca",
        "farm": "El Palto",
        "farmer": "Luz Helena Salazar",
        "elevation": "1590",
        "variety": "Gesha",
        "processing": "Washed",
        "aromatics": "Cacao, blueberry, red grape",
        "cupping_points": "88.0",
        "decaffeinated": false
      }
    }
  ]
}
```

| Field | Required | Rules |
|---|---|---|
| `version` | yes | The number `1`. Any other value and the whole feed is refused. |
| `roaster.name` | yes | Up to 120 characters. |
| `roaster.url` | no | https. Shown as "Open roaster's site". |
| `roaster.feed` | no | Informational. The app uses the address from the link. |
| `coffees` | yes | An array. Only the first 200 entries are read. |
| `coffees[].id` | recommended | Up to 200 characters, stable for the life of the coffee. Coffees without one are addressed by position. |
| `coffees[].name` | yes | Up to 120 characters. A recipe added from the catalogue is named `{name} - {size}`. |
| `coffees[].available` | no | Only `true` counts as on sale. Missing or anything else shows as sold out. |
| `coffees[].url`, `image` | no | https, up to 2,000 characters. |
| `coffees[].recipes` | yes | Up to 10 entries of `{size, share}`. `size` is a short label (up to 20 characters); `share` is an https xBloom share link with an `id`. A coffee with no usable recipe is skipped. The `18g` recipe is offered first. |
| `coffees[].roast` | no | `level` (text, up to 120 characters) and `rest_days`, `peak_day`, `best_until_day` (whole numbers of days since roasting, 0 to 540). Shown as "Rest 14 days, peak day 35, best by day 52". Each value is checked on its own. |
| `coffees[].bag_sizes_g` | no | Up to 10 whole numbers of grams, 1 to 5,000. |
| `coffees[].bean` | no | The same fields as the link's `bean.*` parameters, under the same length caps. Numbers and booleans may be sent as JSON values or strings. |

Unknown fields are ignored, so you can add your own. Values that break a rule are
dropped one field at a time; a coffee is only skipped when it has no name or no
usable recipe.

The whole body must be under 1,000,000 characters. A thirty-coffee feed is about
34 kB.

## What the app does with it

- **Subscribing** stores the roaster and caches the feed. Nothing is imported and
  no shelf is made. A shelf is what the person owns, so they choose what goes on
  one.
- **Browsing** the catalogue reads only the cached feed: photo, name, roast level,
  tasting notes, bag sizes and whether each coffee is on sale. Sold-out coffees
  are shown, after the ones on sale.
- **Opening a coffee** fetches its recipe from xBloom at that moment, so it shows
  the roaster's latest. From there the person can:
  - **Brew now**: the recipe opens in the editor without being saved.
  - **Add to library**: saved through the normal import path.
  - **Add to shelf**: added to the library if needed, then put on a shelf they pick
    or make.
- **Refreshing** happens when the app opens or comes back to the foreground, at
  most once every 12 hours, and whenever the person taps Refresh. It reads the
  feed and nothing else: new coffees appear, sold-out and removed ones update in
  the catalogue. It never changes the library.

## Library copies and xBloom

Apps must not poll xBloom for catalogue recipes. XBRW++ fetches a recipe from
xBloom only when a person opens a coffee, imports a link, adds a coffee or brews
it. There is no background check and no check when a library recipe is opened.

A recipe in someone's library is theirs and never changes on its own. It changes
only when they import the same share link again (from a link or the catalogue)
and your recipe on xBloom has changed since:

- if they have not edited their copy, it takes your new brewing content quietly;
- if they have, the app asks "The roaster has a newer version" with "Use the
  roaster's latest" or "Keep mine".

Either way their name for it, their notes, tags and brew history stay. To change
a recipe for everyone, update it on xBloom under the same share link; people get
it the next time they open it from your catalogue or your link. A new share link
is a new recipe.

## Polling

Apps may poll a feed. XBRW++ reads it no more than every 12 hours per
subscriber, and only while the app is open. If you serve the feed from your own
infrastructure, expect that kind of load, and cache it. Other apps reading this
format should not poll more often than every few hours.
