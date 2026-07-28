# OSRM data

Thư mục này chứa source OSM và graph MLD đã build cho Đồng Xuân/vùng đệm.
Artifact sinh ra không commit Git vì có dung lượng lớn; release/pilot phải sao chép
nguyên thư mục cùng manifest và chạy preflight checksum trước khi khởi động.

Tên file nguồn được hỗ trợ:

- `dong-xuan.osm`
- `dong-xuan.osm.pbf`

Graph runtime có basename `dong-xuan.osrm`; manifest là
`dong-xuan.osrm.manifest.json`.
