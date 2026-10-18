# Roaster feed

A roaster feed is one JSON file listing every coffee a roaster has published an
xBloom recipe for. An XBRW++ import link can point at it, and the app then offers
to subscribe to that roaster: a shelf of its coffees that stays up to date.

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
- The offer is made after that import, once the person is back in their library.
  It is not made if every available coffee is already in their library, if they
  already subscribe to this feed, or if they ticked "Don't ask again" for it.
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
| `roaster.name` | yes | Up to 120 characters. It names the shelf (cut to 32 characters, the tag limit). |
| `roaster.url` | no | https. Shown as "Open roaster's site". |
| `roaster.feed` | no | Informational. The app uses the address from the link. |
| `coffees` | yes | An array. Only the first 200 entries are read. |
| `coffees[].id` | recommended | Up to 200 characters, stable for the life of the coffee. Used to recognise the coffee if its share links change. |
| `coffees[].name` | yes | Up to 120 characters. The recipe is named `{name} - {size}`. |
| `coffees[].available` | no | Only `true` counts as on sale. Missing or anything else is sold out. |
| `coffees[].url`, `image` | no | https, up to 2,000 characters. |
| `coffees[].recipes` | yes | Up to 10 entries of `{size, share}`. `size` is a short label (up to 20 characters); `share` is an https xBloom share link with an `id`. A coffee with no usable recipe is skipped. |
| `coffees[].bean` | no | The same fields as the link's `bean.*` parameters, under the same length caps. Numbers and booleans may be sent as JSON values or strings. |

Unknown fields are ignored, so you can add your own. Values that break a rule are
dropped one field at a time; a coffee is only skipped when it has no name or no
usable recipe.

The whole body must be under 1,000,000 characters. A thirty-coffee feed is about
34 kB.

## What the app does with it

- **On subscribing:** every available coffee not already in the library is
  imported, one recipe each: the `18g` recipe, or the first recipe listed when
  there is no 18g one. Each goes on a shelf named after the roaster. Coffees the
  library already holds are put on the shelf as they are.
- **Afterwards:** the app checks the feed again when it is opened or brought back
  to the foreground, at most once every 12 hours, and whenever the person taps
  Refresh. There is no background fetch. New available coffees are imported and
  shelved. A coffee that is marked unavailable, or that disappears from the feed,
  is shown as sold out on the shelf. Nothing is ever deleted, and a coffee that
  comes back in stock loses its sold-out mark.
- A coffee the subscription has already handled is never handled again, so a
  recipe the person deleted or took off the shelf stays that way.
- Recipe changes are not followed yet. If you change a recipe on xBloom under the
  same share link, subscribers keep the copy they imported.
- Each new coffee is fetched from xBloom's share endpoint, two at a time.

## Polling

Apps may poll a feed. XBRW++ polls no more than every 12 hours per subscriber, and
only while the app is open. If you serve the feed from your own infrastructure,
expect that kind of load, and cache it. Other apps reading this format should not
poll more often than every few hours.
