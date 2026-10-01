// Removes classroom-stream files whose database row is gone (deleted rooms,
// deleted accounts). Storage files cannot be deleted with SQL, only through
// the Storage API, so this runs with the service role.
export async function sweepOrphanedStreamFiles(admin:any,maxCount=500){
  const {data,error}=await admin.rpc('stream_orphan_objects',{max_count:maxCount});
  if(error)throw error;
  const names=(Array.isArray(data)?data:[]).filter((name:unknown)=>typeof name==='string');
  let removed=0;
  for(let offset=0;offset<names.length;offset+=100){
    const {error:removeError}=await admin.storage.from('classroom-stream').remove(names.slice(offset,offset+100));
    if(removeError)throw removeError;
    removed+=Math.min(100,names.length-offset);
  }
  return removed;
}
