// ExMC physiologic observation profile.
// Source-controlled FHIR Shorthand; build with SUSHI (`sushi fsh/`), validate
// generated artifacts with the HL7 FHIR Validator (ADR-004).

Alias: $UCUM = http://unitsofmeasure.org
Alias: $LOINC = http://loinc.org

Profile: ExmcPhysiologyObservation
Parent: Observation
Id: exmc-physiology-observation
Title: "ExMC Physiology Observation"
Description: "Clinically meaningful physiologic measurement produced by a ExMC-class exploration medical device. Raw high-rate telemetry stays in telemetry formats and is NOT represented with this profile."
* status MS
* code MS
* code from http://loinc.org (preferred)
* device 1..1 MS
* device only Reference(Device)
* value[x] only Quantity
* valueQuantity.system 1..1
* valueQuantity.system = $UCUM (exactly)
* valueQuantity.code 1..1
* effective[x] only dateTime
* subject only Reference(Patient)
* subject ^short = "Bound only after deployment binding; engineering artifacts never carry patient identity"
