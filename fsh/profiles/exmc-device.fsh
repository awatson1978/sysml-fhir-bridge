Profile: ExmcDevice
Parent: Device
Id: exmc-device
Title: "ExMC Deployed Medical Device"
Description: "A deployed flight unit of an engineered ExMC medical device type. The engineering definition lives in SysML; this resource is the runtime/operational identity created at deployment binding."
* definition 1..1 MS
* serialNumber 1..1 MS
* status MS

Profile: ExmcDeviceMetric
Parent: DeviceMetric
Id: exmc-device-metric
Title: "ExMC Device Metric"
Description: "Metric capability of a ExMC device. Defines what can be measured (capability), never the sampled value — values are Observations."
* type MS
* device 1..1 MS
* unit MS
* unit from http://unitsofmeasure.org (required)
