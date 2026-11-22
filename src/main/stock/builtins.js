const ovImage={items:'results',fields:{id:'id',title:'title',preview:'thumbnail',full:'url',width:'width',height:'height',author:'creator',authorUrl:'creator_url',pageUrl:'foreign_landing_url',license:'license',licenseVersion:'license_version',licenseUrl:'license_url'}};
const ovAudio={items:'results',fields:{id:'id',title:'title',preview:'thumbnail',full:'url',author:'creator',authorUrl:'creator_url',pageUrl:'foreign_landing_url',license:'license',licenseVersion:'license_version',licenseUrl:'license_url',durationMs:'duration'}};
const ov='https://api.openverse.org/v1/',filter='page={page}&page_size=20&license_type=commercial,modification';
module.exports=[
 // Openverse needs no key. Music comes from Jamendo, sound effects from Freesound (they carry no category there).
 {format:'reccut-image-source-v1',id:'openverse',name:'Openverse',homepage:'https://openverse.org/',hosts:['api.openverse.org'],kinds:['photo'],search:{url:`${ov}images/?q={query}&${filter}`},results:ovImage,
  // ponytail: no illustration search, Openverse's category=illustration times out (504). Pixabay has illustrations.
  searches:{music:{search:{url:`${ov}audio/?q={query}&${filter}&category=music`},results:ovAudio},sfx:{search:{url:`${ov}audio/?q={query}&${filter}&source=freesound`},results:ovAudio}}},
 // ponytail: Magnific publishes tool names but no result schema, so each field lists the likely names.
 // Check against a live tools/list response with an account and trim the lists once known.
 {format:'reccut-mcp-source-v1',id:'magnific',name:'Magnific',homepage:'https://www.magnific.com/',hosts:['mcp.magnific.com'],server:'https://mcp.magnific.com',tools:{search:'stock_search',details:'stock_get',download:'stock_download'},costsCredits:true,
  kinds:['photo','vector','icon','video'],contentTypes:{photo:'photo',vector:'vector',icon:'icon',video:'video'},
  results:{items:['results','data','items','resources'],fields:{id:'id',preview:['preview_url','preview.url','thumbnail_url','thumbnail.url','thumbnail','image.source.url','image.url','preview'],full:['url','page_url','preview_url','preview.url','thumbnail_url','thumbnail.url','image.source.url'],title:['title','name'],author:['author.name','author','creator.name'],pageUrl:['url','page_url'],license:['license','licenses.0.type'],width:['width','dimensions.width'],height:['height','dimensions.height']}}}
];
