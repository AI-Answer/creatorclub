import {CHANNEL_BOARD} from '../../../shared/club';

/** Where a Board's routes are: a video's under `/videos/<id>`, Research (the channel's own Board) under `/channel`. */
export const boardBase=(board:string)=>board===CHANNEL_BOARD?'/channel':`/videos/${encodeURIComponent(board)}`;

export const isResearch=(board:string)=>board===CHANNEL_BOARD;
