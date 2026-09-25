export function assessUpgrade({savedSchemaHash,packagedSchemaHash,inspection}) {
 if(inspection?.kind==='incompatible')return {canStart:false,requiresMigration:false,reason:'INCOMPATIBLE_DATABASE'};
 const same=Boolean(savedSchemaHash&&savedSchemaHash===packagedSchemaHash);
 return {canStart:same,requiresMigration:!same,reason:same?null:'SCHEMA_CHECK_REQUIRED'};
}
