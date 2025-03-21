const MeetingHistory = require('../../model/schema/meeting')
const User = require('../../model/schema/user')
const mongoose = require('mongoose');

const add = async (req, res) => {
    try {
        const meeting = new MeetingHistory({
            ...req.body,
            createdDate: new Date()
        });
        await meeting.save();
        res.status(200).json(meeting);
    } catch (error) {
        console.error("Error creating meeting:", error);
        res.status(400).json({ error: "Failed to create meeting" });
    }
}

const index = async (req, res) => {
    try {
        const query = req.query;
        query.deleted = false;
        
        const user = await User.findById(req.user.userId);
        if (user?.role !== "superAdmin") {
            delete query.createBy;
            query.$or = [
                { createBy: new mongoose.Types.ObjectId(req.user.userId) },
                { attendes: new mongoose.Types.ObjectId(req.user.userId) }
            ];
        }

        let result = await MeetingHistory.aggregate([
            { $match: query },
            {
                $lookup: {
                    from: "Contacts",
                    localField: "attendes",
                    foreignField: "_id",
                    as: "contactAttendees"
                }
            },
            {
                $lookup: {
                    from: "Lead",
                    localField: "attendesLead",
                    foreignField: "_id",
                    as: "leadAttendees"
                }
            },
            {
                $lookup: {
                    from: "User",
                    localField: "createBy",
                    foreignField: "_id",
                    as: "creator"
                }
            },
            { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
            { $match: { "creator.deleted": false } },
            {
                $addFields: {
                    createdByName: { 
                        $concat: ["$creator.firstName", " ", "$creator.lastName"] 
                    },
                    allAttendees: {
                        $concatArrays: [
                            {
                                $map: {
                                    input: "$contactAttendees",
                                    as: "contact",
                                    in: {
                                        id: "$$contact._id",
                                        name: "$contact.fullName",
                                        type: "contact"
                                    }
                                }
                            },
                            {
                                $map: {
                                    input: "$leadAttendees",
                                    as: "lead",
                                    in: {
                                        id: "$$lead._id",
                                        name: "$$lead.leadName",
                                        type: "lead"
                                    }
                                }
                            }
                        ]
                    }
                }
            },
            {
                $project: {
                    creator: 0,
                    contactAttendees: 0,
                    leadAttendees: 0
                }
            }
        ]);

        res.status(200).json(result);
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const view = async (req, res) => {
    try {
        const meeting = await MeetingHistory.findOne({ _id: req.params.id });
        if (!meeting) return res.status(404).json({ message: "No data found" });

        const result = await MeetingHistory.aggregate([
            { $match: { _id: meeting._id } },
            {
                $lookup: {
                    from: "Contacts",
                    localField: "attendes",
                    foreignField: "_id",
                    as: "contactAttendees"
                }
            },
            {
                $lookup: {
                    from: "Lead",
                    localField: "attendesLead",
                    foreignField: "_id",
                    as: "leadAttendees"
                }
            },
            {
                $lookup: {
                    from: "User",
                    localField: "createBy",
                    foreignField: "_id",
                    as: "creator"
                }
            },
            {
                $lookup: {
                    from: "User",
                    localField: "modifiedBy",
                    foreignField: "_id",
                    as: "modifier"
                }
            },
            {
                $lookup: {
                    from: "User",
                    localField: "assignedTo",
                    foreignField: "_id",
                    as: "assignee"
                }
            },
            {
                $lookup: {
                    from: "Opportunities",
                    localField: "opportunity",
                    foreignField: "_id",
                    as: "opportunityData"
                }
            },
            {
                $lookup: {
                    from: "Accounts",
                    localField: "account",
                    foreignField: "_id",
                    as: "accountData"
                }
            },
            { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$modifier", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$assignee", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$opportunityData", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$accountData", preserveNullAndEmptyArrays: true } },
            { $match: { "creator.deleted": false } },
            {
                $addFields: {
                    createdByName: { $concat: ["$creator.firstName", " ", "$creator.lastName"] },
                    modifiedByName: { $concat: ["$modifier.firstName", " ", "$modifier.lastName"] },
                    assigneeName: {
                        $cond: {
                            if: "$assignee",
                            then: { $concat: ["$assignee.firstName", " ", "$assignee.lastName"] },
                            else: ""
                        }
                    },
                    opportunityName: "$opportunityData.opportunityName",
                    accountName: "$accountData.name",
                    allAttendees: {
                        $concatArrays: [
                            {
                                $map: {
                                    input: "$contactAttendees",
                                    as: "contact",
                                    in: {
                                        id: "$$contact._id",
                                        name: "$$contact.fullName",
                                        type: "contact"
                                    }
                                }
                            },
                            {
                                $map: {
                                    input: "$leadAttendees",
                                    as: "lead",
                                    in: {
                                        id: "$$lead._id",
                                        name: "$$lead.leadName",
                                        type: "lead"
                                    }
                                }
                            }
                        ]
                    }
                }
            },
            {
                $project: {
                    creator: 0,
                    modifier: 0,
                    assignee: 0,
                    contactAttendees: 0,
                    leadAttendees: 0,
                    opportunityData: 0,
                    accountData: 0
                }
            }
        ]);

        res.status(200).json(result[0]);
    } catch (error) {
        console.error("Error:", error);
        res.status(400).json({ error });
    }
}

const deleteData = async (req, res) => {
    try {
        const result = await MeetingHistory.findByIdAndUpdate(
            req.params.id,
            { deleted: true },
            { new: true }
        );
        
        if (!result) {
            return res.status(404).json({ error: "Meeting not found" });
        }
        
        res.status(200).json({ message: "Meeting deleted successfully", result });
    } catch (error) {
        console.error("Error deleting meeting:", error);
        res.status(400).json({ error: "Failed to delete meeting" });
    }
}

const deleteMany = async (req, res) => {
    try {
        const result = await MeetingHistory.updateMany(
            { _id: { $in: req.body } },
            { $set: { deleted: true } }
        );

        if (result?.matchedCount === 0) {
            return res.status(404).json({ error: "No meetings found" });
        }

        if (result?.modifiedCount === 0) {
            return res.status(400).json({ error: "No meetings were deleted" });
        }

        res.status(200).json({
            message: "Meetings deleted successfully",
            deletedCount: result.modifiedCount,
            result
        });
    } catch (error) {
        console.error("Error deleting meetings:", error);
        res.status(400).json({ error: "Failed to delete meetings" });
    }
}

module.exports = { add, index, view, deleteData, deleteMany }