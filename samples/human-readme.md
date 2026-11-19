# tidepool

A small time-series store for sensor data. It keeps the last 30 days in memory and spills older
points to Parquet files on disk.

## Installation

```bash
pip install tidepool
```

Set your API key before running the uploader:

```bash
export TIDEPOOL_API_KEY=YOUR_API_KEY
```

## Usage

```python
from tidepool import Store

store = Store("data/")
store.write("greenhouse.temp", 21.4)
```

Navigate to `http://localhost:8080/dashboard` to see the live charts. The dashboard works in
portrait and landscape mode on tablets.

## Configuration

- **`retention`:** how many days to keep in memory (default 30).
- **`flush_interval`:** seconds between writes to disk.
- **`realm`:** the Kerberos realm used when talking to HDFS.

Note: the uploader needs elevated privileges on Windows to bind to port 80.

## Design notes

Downsampling uses a robust estimator (median of means) so a single bad reading doesn't skew the
hourly average. We leverage the Arrow memory format to avoid copying between the writer and the
query engine. Column names use underscore separation, e.g. `soil_moisture`.

The test harness in `tests/harness.py` replays a recorded week of data — about 2 million points —
and checks that queries return the same results after a restart.

## Known issues

- Queries spanning a DST change return one duplicated hour.
- The BLE beacon reader drops packets when more than ~40 sensors are in range.

## License

MIT
