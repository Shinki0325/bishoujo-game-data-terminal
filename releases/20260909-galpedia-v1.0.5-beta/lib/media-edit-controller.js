import { createStickerDocument } from './sticker-document.js';
import { createCustomWork } from './custom-work.js';

// Coordinates local edits. Catalog registration and ranking rendering stay with
// the application owner; decoded images belong to one edit and are always freed.
export function createMediaEditController({
  store, environment, previewUrlForWork, authorityThumbnailPathForWork,
  registerCustomWork, onMediaChanged, closePreview,
  createId = () => `custom-local-${crypto.randomUUID()}`, logger = console
}) {
  let editing = false;
  let generation = 0;
  function requireStore() {
    if (store === null) throw new Error('本地图片存储不可用');
    return store;
  }
  function releaseResource(resource, label) {
    try { resource?.release?.(); }
    catch (error) { logger.error?.(`释放${label}失败`, error); }
  }
  async function editBase(baseBlob, documentOrFactory, isCurrent) {
    const decoded = await environment.decodeBlob(baseBlob);
    let assets;
    try {
      if (!isCurrent()) return null;
      const document = typeof documentOrFactory === 'function'
        ? documentOrFactory(decoded)
        : documentOrFactory;
      if (!isCurrent()) return null;
      const editor = await environment.loadEditor();
      if (!isCurrent()) return null;
      // Custom-image resources may depend on the document. Keep this exact
      // object identity for both loading and opening the editor.
      assets = await environment.loadStickerImages(document);
      if (!isCurrent()) return null;
      return await editor.open({baseImage:decoded.image,baseBlob,
        document,stickerImages:assets.images});
    } finally {
      releaseResource(decoded, '底图');
      releaseResource(assets, '贴纸资源');
    }
  }
  async function editingTransaction(run) {
    if (editing) throw new Error('图片贴纸编辑器正在使用中。');
    editing = true;
    const token = ++generation;
    try { return await run(() => generation === token); }
    finally { editing = false; }
  }
  async function editCrop({baseBlob,width,height,stickerDocument}) {
    return editingTransaction(async isCurrent => {
      const documentOrFactory = stickerDocument ?? createStickerDocument({baseWidth:width,baseHeight:height});
      const edited=await editBase(baseBlob,documentOrFactory,isCurrent);
      if (edited===null||!isCurrent()) return null;
      return {
        baseBlob: edited.baseBlob ?? baseBlob,
        compositeBlob: edited.compositeBlob,
        stickerDocument: edited.document ?? edited.stickerDocument
      };
    });
  }
  async function editWork(work) {
    return editingTransaction(async isCurrent => {
      requireStore();
      const custom=work.localMediaKind==='custom';
      const identity=custom
        ? {kind:'custom',id:work.workId,width:work.coverWidth,height:work.coverHeight}
        : {kind:'replacement',workId:work.workId,width:work.coverWidth,height:work.coverHeight};
      const editable=await store.editableFor(identity);
      if (!isCurrent()) return false;
      const publicOriginal=!custom&&(editable===null||editable.metadata?.stickerSource==='public');
      const baseBlob=editable?.baseBlob??await environment.blobForUrl(await previewUrlForWork(work));
      if (!isCurrent()) return false;
      let width,height;
      const edited=await editBase(baseBlob,decoded=>{
        width=editable?.stickerDocument.baseWidth??decoded.width;
        height=editable?.stickerDocument.baseHeight??decoded.height;
        return editable?.stickerDocument??createStickerDocument({baseWidth:width,baseHeight:height});
      },isCurrent);
      if (edited===null||!isCurrent()) return false;
      if (edited.document.layers.length===0) {
        if (publicOriginal) await store.clearStickerEdit({kind:'replacement',workId:work.workId,restorePublic:true});
        else if (editable?.metadata?.stickerDocument) await store.clearStickerEdit({...identity,restorePublic:false});
      } else {
        await store.putStickerEdit({...identity,title:editable?.metadata?.title??work.title,width,height,
          baseBlob,compositeBlob:edited.compositeBlob,stickerDocument:edited.document,
          ...(!custom?{authorityThumbnailPath:authorityThumbnailPathForWork(work)}:{}),
          ...(publicOriginal?{stickerSource:'public'}:{})});
      }
      await onMediaChanged(work.workId,{closePreview:true});
      return true;
    });
  }
  async function createCustom({title,blob,width,height,baseBlob,stickerDocument}) {
    requireStore();
    const id=createId();
    if (stickerDocument) await store.putStickerEdit({kind:'custom',id,title,width,height,baseBlob,compositeBlob:blob,stickerDocument});
    else await store.putCustom({id,title,blob,width,height});
    try { registerCustomWork(createCustomWork({id,title,width,height})); }
    catch(error) { await store.deleteCustom(id).catch(cleanupError=>logger.error(cleanupError));throw error; }
    await onMediaChanged(id);
  }
  async function replace(work,record) {
    requireStore();
    if (record.stickerDocument) {
      await store.putStickerEdit({kind:'replacement',workId:work.workId,title:record.title,width:record.width,height:record.height,
        baseBlob:record.baseBlob,compositeBlob:record.blob,stickerDocument:record.stickerDocument,
        authorityThumbnailPath:authorityThumbnailPathForWork(work)});
    } else await store.putReplacement({workId:work.workId,...record,authorityThumbnailPath:authorityThumbnailPathForWork(work)});
    await onMediaChanged(work.workId);
  }
  async function restore(work) {
    requireStore();
    await store.deleteReplacement(work.workId);
    await onMediaChanged(work.workId);
    closePreview();
  }
  function cancel() { generation++;environment.cancel(); }
  return Object.freeze({editCrop,editWork,createCustom,replace,restore,cancel});
}
