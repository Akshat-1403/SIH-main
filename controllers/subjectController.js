const { UNAUTHORIZED_USER, BAD_REQUEST } = require('../errors')
const Subject = require('../models/subjectModel')
const Resource = require('../models/resourceModel')
const User = require('../models/userModel')

async function findReferenceMaterials({commonId, }){
    const data = (await 
        Subject.find({common_id:commonId})
        .sort({version:-1})
        .limit(1)
        .select("referenceMaterial")  
    )[0]
    const ids = data?.referenceMaterial?.cur?.map(el=>el.cur)
    const addIds = data?.referenceMaterial?.add.map(el=>el.value)
    const delIndex = data?.referenceMaterial?.del.map(el=>el.index)

    const referenceMaterial = await Resource.find({_id:{$in:ids}}).select("-description")
    const addReferenceMaterial = await Resource.find({_id:{$in:addIds}}).select("-description")
    
    return {referenceMaterial,addReferenceMaterial,delIndex}
}

exports.findReferenceMaterials = findReferenceMaterials

exports.getSubjectById = async (req, res)=>{
    const data = (await Subject.find({common_id:req.params.commonId})
        .sort({version:-1})
        .limit(1) )[0]
    res.status(200).send({
        status:"success",
        data
    })
}

exports.postSubject = async (req, res)=>{
    ["common_id","version","title","objectives","prerequisites","modules","experiments","referenceMaterial","outcomes"]
    const sub = req.body;
    sub.title = {
        new:[],
        cur:req.body.title
    }
    for(let field of ["objectives","prerequisites","modules","experiments","referenceMaterial","outcomes"]){
        if(!req.body[field])continue
        
        const cur = req.body[field].map(el=>({
            new:[],
            cur:el
        }))

        sub[field] = {
            add:[],
            del:[],
            cur
        }
    }
    const data = await Subject.create(sub);
    const sub2 = data._doc;
    sub2.common_id = sub2._id
    sub2.version = 1
    const data2 = await Subject.findByIdAndUpdate(sub2._id, sub2, {new:true})

    res.status(200).send({
        status:"success",
        data:data2
    })
}

exports.getSubjectForUser = async (req, res, next)=>{
    let user = req.user
    if(!user ){
        user = await User.findById(req.body.user._id)
    }if(!user || !user.areaOfSpecialization){
        return next(new UNAUTHORIZED_USER("cann't resolve user or areaOfSpecialization at backend"))
    }

    const regExAr = user.areaOfSpecialization.map(term => new RegExp(`.*${term}.*`, 'i'))
    
    const data =await Subject.find({title:{$in:regExAr}})

    res.status(200).send({
        status:'success',
        length:data.length,
        data
    })
}

exports.getAllSubjects = async function (req,res, next){
    let {search, page} = req.query
    const matchObj = {}

    if(search && search!==""){
        search = new RegExp(`${search}`)
        matchObj["$or"]=[
            {
                "title":{$regex:search,$options:"i"}
            },
            // {
            //     "modules.title":{$regex:search,$options:"i"}
            // }
        ]
    }
    
    const aggregateQuery = Subject.aggregate()
        .match(matchObj)
        .group({ 
            _id: "$common_id",
            maxVer: { $max: "$version" },
            docs: { $push: "$$ROOT" } 
        })
        .project({
            doc: { 
                $filter: { 
                    input: "$docs",
                    as: "curDoc",
                    cond: { $eq: ["$$curDoc.version", "$maxVer"] }
                }
            }
        })
        .unwind("doc")
    if(page && Number.isInteger(page*1)){
        aggregateQuery.skip((page-1)*12).limit(12)
    }
        

    const data = (await aggregateQuery).map(val=>val.doc)
    
    res.status(200).send({
        status:"success",
        length:data.length,
        data:data
    })
}

exports.getReferenceMaterial = async function(req, res, next){
    const commonId = req.params.commonId;

    const data = await findReferenceMaterials({commonId})

    res.status(200).send({
        status:"success",
        data
    })
}

exports.updateByUser = async (req, res, next) =>{
    let {data, isnew , del , prop} = req.body
    if(prop==undefined || !((del==undefined) ^ (data==undefined)) )return next(new BAD_REQUEST("improper request body"))

    let ind = -1
    if(prop.indexOf('.') != -1){
        [prop,ind] = prop.split('.')
        ind *= 1;
    }
    if(["_id","id","version","common_id","__v","dateOfCommit"].includes(prop)){
        return next(new BAD_REQUEST("No editing allowed on this prop"))
    }
    // if(prop === "modules"){
    //     return next(new BAD_REQUEST("modules field cannot be update by this route use another route"))
    // }

    //find the course By id and update the Course
    const userId = req.user._id
    const subCommonId = req.params.commonId
    const sub = (await Subject.find({common_id:subCommonId})
        .sort({version:-1})
        .limit(1))[0]
    
    if(!sub) return next(new BAD_REQUEST("Invalid sub Id"))
    if(!sub[prop]) return next(new BAD_REQUEST("Field does not exists"))
    if(del){
        if (!sub[prop].del)
            return next(new BAD_REQUEST("cannot delete from a non array field"));
        if(ind >= sub[prop].cur.length)
                return next(new BAD_REQUEST("index range out of bond"))

        await Subject.findOneAndUpdate({_id:sub._id},{
            "$push":{
                [`${prop}.del`]:{
                    by:userId,
                    index:ind
                }
            }
        })
    }else if(isnew){
        if (!sub[prop].add)
            return next(new BAD_REQUEST("cannot add to a non array field"));
        
        await Subject.findOneAndUpdate({_id:sub._id},{
            "$push":{
                [`${prop}.add`]:{
                    by:userId,
                    value:data
                }
            }
        })
    }else{
        if(ind!=-1){
            if (!sub[prop].add)
                return next(new BAD_REQUEST(`cannot update element at index ${ind} for a non array field`));
            if(ind >= sub[prop].cur.length)
                return next(new BAD_REQUEST("index range out of bond"))
            await Subject.findOneAndUpdate({_id:sub._id},{
                "$push":{
                    [`${prop}.cur.${ind}.new`]:{
                        by:userId,
                        value:data
                    }
                }
            })
        }
        else{
            await Subject.findOneAndUpdate({_id:sub._id},{
                "$push":{
                    [`${prop}.new`]:{
                        by:userId,
                        value:data
                    }
                }
            })
        }
    }
    res.status(200).send({
        status:"success"
    })
}

exports.acceptUpdates = async function(req,res,next){
    //req.body = {
    //  prop:"prop.ind",
    //  index:
    //  del:
    //  isnew
    // }

    let {index, isnew , del , prop} = req.body
    if(prop==undefined || index==undefined)return next(new BAD_REQUEST("improper request body"))

    let ind = -1
    if(prop.indexOf('.') != -1){
        [prop,ind] = prop.split('.')
        ind *= 1;
    }
    if(["_id","id","version","common_id","__v","dateOfCommit"].includes(prop)){
        return next(new BAD_REQUEST("No editing allowed on this prop"))
    }
    if(prop=="modules"){
        return next(new BAD_REQUEST("modules field cannot be update by this route use another route"))
    }

    //find the subject By id and update the subject
    const subCommonId = req.params.commonId
    const sub = (await Subject.find({common_id:subCommonId})
        .sort({version:-1})
        .limit(1))[0]
    
    if(!sub)return next(new BAD_REQUEST("Invalid sub Id"))
    if(!sub[prop])return next(new BAD_REQUEST("Field does not exists"))
    if(del){
        if (!sub[prop].del)
            return next(new BAD_REQUEST("cannot delete from a non array field"));
        if(index >= sub[prop].del.length)
            return next(new BAD_REQUEST("index range out of bond"))

        const delInd = (sub[prop].del[index].index)*1
        for(let i in sub[prop].del){
            if(sub[prop].del[i].index > delInd){
                sub[prop].del[i].index --;
            }
        }
        sub[prop].del.splice(index,1)
        sub[prop].cur.splice(delInd, 1)
        await Subject.findOneAndUpdate({_id:sub._id},{
            "$set":{
                [`${prop}.del`]:sub[prop].del,
                [`${prop}.cur`]:sub[prop].cur
            }
        })
    }else if(isnew){
        if (!sub[prop].add)
            return next(new BAD_REQUEST("cannot add to a non array field"));
        if(index >= sub[prop].add.length)
            return next(new BAD_REQUEST("index range out of bond"))
        
        const current = {
            new:[],
            cur:sub[prop].add.splice(index, 1)[0].value
        }

        await Subject.findOneAndUpdate({_id:sub._id},{
            "$set":{
                [`${prop}.add`]:sub[prop].add,
            },
            "$push":{
                [`${prop}.cur`]:current
            }
        })
    }else{
        if(ind!=-1){
            if (!sub[prop].add)
                return next(new BAD_REQUEST(`cannot update element at index ${ind} for a non array field`));
            if(ind >= sub[prop].cur.length)
                return next(new BAD_REQUEST("index range out of bond"))
            
            const val = sub[prop].cur[ind].new[index].value
            if(typeof(val) === 'object'){
                for(let i in sub[prop].cur[ind].cur){
                    if(val[i]==undefined){
                        val[i]=sub[prop].cur[ind].cur[i]
                    }
                }
            }
            
            await Subject.findOneAndUpdate({_id:sub._id},{
                "$set":{
                    [`${prop}.cur.${ind}.cur`]:val
                }
            })
        }
        else{
            if(index >= sub[prop].new.length)
                return next(new BAD_REQUEST("index range out of bond"))
            await Subject.findOneAndUpdate({_id:sub._id},{
                "$set":{
                    [`${prop}.cur`]:sub[prop].new[index].value
                }
            })
        }
    }
    res.status(200).send({
        status:"success"
    })
}

exports.modulesUpdateByUser = async function(req, res, next){
    
}