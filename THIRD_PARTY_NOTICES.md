# Third-party notices

## IconPark

The frontend uses `@icon-park/react`, maintained by ByteDance and distributed under the Apache License 2.0.

- Project: <https://github.com/bytedance/IconPark>
- License copy: [`licenses/iconpark-apache-2.0.txt`](licenses/iconpark-apache-2.0.txt)

No IconPark attribution is rendered in the application interface. The license notice is retained with the source distribution.

## OpenStreetMap data and Standard tiles

The interactive maps use OpenStreetMap Standard raster tiles. Administrative boundaries and the checked-in point-of-interest snapshot are derived from OpenStreetMap data.

- Copyright: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Data license: [Open Data Commons Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- Standard tile service: <https://tile.openstreetmap.org/>
- Tile usage policy: <https://operations.osmfoundation.org/policies/tiles/>

OpenStreetMap attribution remains visible on every interactive map. SafeStock X does not bulk-download, prefetch, redistribute, archive, or implement persistent offline caching of OpenStreetMap Standard tiles. Normal browser HTTP caching is left enabled as required by the tile service policy. The public tile service is an online, best-effort dependency and does not provide an availability SLA.

## Overpass API

The versioned boundary and point-of-interest snapshots are generated from OpenStreetMap through public Overpass API instances.

- Project: <https://overpass-api.de/>
- OpenStreetMap data copyright and license apply to the generated snapshots.

Overpass is used only during an explicit dataset-generation command. The application does not query Overpass during normal map browsing. Generation is rate-limited, validates complete coverage before publication, and retains the existing snapshot if any required request or validation fails.
