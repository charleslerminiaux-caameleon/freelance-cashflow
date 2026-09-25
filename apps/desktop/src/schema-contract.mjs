import {createHash} from 'node:crypto';
// Only application objects, independent of database OIDs, row contents and owners.
export const contractQuery=`with relations as (
 select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f')
 and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
), functions as (
 select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
)
select jsonb_build_object(
 'relations',coalesce((select jsonb_agg(jsonb_build_array(relname,relkind,relrowsecurity,relforcerowsecurity) order by relname) from relations),'[]'::jsonb),
 'columns',coalesce((select jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attname)
 from relations c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum),'[]'::jsonb),
 'functions',coalesce((select jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),p.prosecdef,p.provolatile,p.proconfig,p.prosrc) order by p.proname,pg_get_function_identity_arguments(p.oid)) from functions p),'[]'::jsonb),
 'policies',coalesce((select jsonb_agg(jsonb_build_array(c.relname,p.polname,p.polcmd,p.polpermissive,(select jsonb_agg(case when r=0 then 'public' else pg_get_userbyid(r)::text end order by case when r=0 then 'public' else pg_get_userbyid(r)::text end) from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by c.relname,p.polname) from relations c join pg_policy p on p.polrelid=c.oid),'[]'::jsonb),
 'constraints',coalesce((select jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid)) order by c.relname,k.conname) from relations c join pg_constraint k on k.conrelid=c.oid),'[]'::jsonb),
 'triggers',coalesce((select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from relations c join pg_trigger t on t.tgrelid=c.oid where not t.tgisinternal),'[]'::jsonb)
) as contract`;
export function contractHash(contract){
 if(!contract||!['relations','columns','functions','policies','constraints','triggers'].every(k=>Array.isArray(contract[k])))throw Error('INVALID_SCHEMA_CONTRACT');
 const normalized=Object.fromEntries(Object.entries(contract).sort(([a],[b])=>a.localeCompare(b)));
 return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
