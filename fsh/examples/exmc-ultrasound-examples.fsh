Instance: exmc-ultrasound-type
InstanceOf: DeviceDefinition
Usage: #example
Title: "ExmcUltrasound device type"
* description = "Diagnostic ultrasound device type for exploration medical operations."
* modelNumber = "HUS-3000"

Instance: ultrasound-unit01
InstanceOf: ExmcDevice
Usage: #example
Title: "Deployed ultrasound flight unit 01"
* definition = Reference(DeviceDefinition/exmc-ultrasound-type)
* serialNumber = "SN-0001"
* status = #active

Instance: heart-rate-observation-example
InstanceOf: ExmcPhysiologyObservation
Usage: #example
Title: "Heart rate measured by deployed ultrasound unit"
* status = #final
* code = http://loinc.org#8867-4 "Heart rate"
* device = Reference(Device/ultrasound-unit01)
* valueQuantity = 72 '/min' "bpm"
* effectiveDateTime = "2027-03-18T16:22:00Z"
