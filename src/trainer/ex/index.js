// Упражнения тренера по порядку в списке. Каждое в своём файле: данные в форме базы (тексты из тренировки/база/exercises.json),
// стартовый ракурс, снаряды (setup), поза по фазе (pose) и свои проверки (audit).
import rdl from './romanian-deadlift-db.js';
import squat from './back-squat-bb.js';
import bench from './db-bench-press.js';
import row from './bent-over-row-db.js';
import lunge from './reverse-lunge-db.js';
import plank from './side-plank.js';
import chop from './cable-woodchop.js';
// Восстановление и мобильность (23.11.2026): без хвата и без снарядов.
import hamStretch from './hamstring-static-stretch.js';
import hip9090 from './hip-90-90.js';
import spiderman from './spiderman-lunge.js';
import deadBug from './dead-bug.js';
import birdDog from './bird-dog.js';
import gluteBridge from './single-leg-glute-bridge.js';
import swimmer from './superman-swimmer.js';
import ytwl from './ytwl-raise.js';
// Работа ног под теннис (23.11.2026, исполнитель A): шаги по полу, помощник ../steps.js.
import shuffle from './lateral-shuffle.js';
import carioca from './carioca.js';
import crossover from './crossover-step-drill.js';
import spider from './spider-drill.js';
import intervals from './court-intervals.js';
// Работа ног под теннис (23.11.2026, исполнитель B): прыжки и торможение, помощник ../jump.js.
import splitStep from './split-step-reaction.js';
import bound from './lateral-bound-stick.js';
import decel from './deceleration-lunge.js';
import balance from './single-leg-balance.js';
// Волна 23.11.2026, группа legs.
import goblet from './goblet-squat-db.js';
import lateralLunge from './lateral-lunge-db.js';
import stepUp from './step-up-db.js';
import bulgarian from './bulgarian-split-squat-db.js';
import boxSquat from './single-leg-box-squat.js';
import trapBar from './trap-bar-deadlift.js';
import farmer from './farmer-carry.js';
// Волна 23.11.2026, группа bandlegs.
import bwSquat from './bodyweight-squat.js';
import calfRaise from './single-leg-calf-raise.js';
import kneeWall from './knee-to-wall-ankle.js';
import walkLunge from './walking-lunge.js';
import monster from './monster-walk-band.js';
import bandWalk from './lateral-band-walk.js';
import hipEr from './standing-hip-er-band.js';
// Волна 23.11.2026, группа posterior.
import rdlBar from './romanian-deadlift-bb.js';
import slRdl from './single-leg-rdl-db.js';
import hipThrust from './hip-thrust-bb.js';
import nordic from './nordic-hamstring.js';
import copenhagen from './copenhagen-plank.js';
import sliderCurl from './slider-leg-curl.js';
import abduction from './side-lying-hip-abduction.js';
// Волна 23.11.2026, группа core.
import frontPlank from './front-plank.js';
import pushUp from './push-up.js';
import wallPlus from './wall-push-up-plus.js';
import pallof from './pallof-press.js';
import cableLift from './cable-lift.js';
import rotPull from './rotational-pull-band.js';
import twist from './russian-twist.js';
import reverseCrunch from './reverse-crunch.js';
// Волна 23.11.2026, группа pulls.
import pullUp from './pull-up.js';
import invRow from './inverted-row.js';
import inclinePress from './incline-db-press.js';
import bandRow from './band-low-row.js';
import reverseFly from './cable-reverse-fly.js';
import cablePress from './single-arm-cable-press.js';
import kneelPulldown from './kneeling-lat-pulldown.js';
import oneArmRow from './one-arm-db-row.js';
// Волна 23.11.2026, группа medball.
import overheadThrow from './mb-overhead-throw.js';
import sideThrow from './mb-side-throw.js';
import chestPass from './mb-chest-pass.js';
import slam from './mb-overhead-slam.js';
import cmj from './countermovement-jump.js';
import broadJump from './broad-jump.js';
import ankleHops from './ankle-hops.js';
import accel from './acceleration-5m.js';
// Волна 23.11.2026, группа warmup.
import highKnees from './high-knees.js';
import buttKicks from './butt-kicks.js';
import legMarch from './straight-leg-march.js';
import armCircles from './arm-circles.js';
import armHugs from './arm-hugs.js';
import lungeTwist from './lunge-with-twist.js';
import inchworm from './inchworm.js';
// Волна 23.11.2026, группа shoulder.
import bandEr from './band-er-elbow-side.js';
import bandIr from './band-ir-elbow-side.js';
import er9090 from './band-er-90-90.js';
import sideEr from './sidelying-er-db.js';
import proneT from './prone-horizontal-abduction.js';
import scapRet from './band-scap-retraction.js';
import scapDep from './scap-depression-elbow-to-hip.js';
import d2 from './band-d2-diagonal.js';
// Волна 23.11.2026, группа arms.
import bandTriceps from './band-triceps-extension.js';
import wristFlex from './wrist-flex-ext-db.js';
import tyler from './tyler-twist.js';
import pronation from './forearm-pronation-supination.js';
import crossArm from './cross-arm-stretch.js';
import tricepsStretch from './triceps-overhead-stretch.js';
import reverseThrow from './band-reverse-throw.js';
// 24.11.2026: растяжка «спящего» (лёжа на плече, ключица нижней руки вперёд).
import sleeper from './sleeper-stretch.js';

export default [rdl, squat, bench, row, lunge, plank, chop, hamStretch, hip9090, spiderman, deadBug, birdDog, gluteBridge, swimmer, ytwl, shuffle, carioca, crossover, spider, intervals, splitStep, bound, decel, balance, goblet, lateralLunge, stepUp, bulgarian, boxSquat, trapBar, farmer, bwSquat, calfRaise, kneeWall, walkLunge, monster, bandWalk, hipEr, rdlBar, slRdl, hipThrust, nordic, copenhagen, sliderCurl, abduction, frontPlank, pushUp, wallPlus, pallof, cableLift, rotPull, twist, reverseCrunch, pullUp, invRow, oneArmRow, kneelPulldown, reverseFly, bandRow, inclinePress, cablePress, overheadThrow, sideThrow, chestPass, slam, cmj, broadJump, ankleHops, accel, highKnees, buttKicks, legMarch, armCircles, armHugs, lungeTwist, inchworm, bandEr, bandIr, er9090, sideEr, proneT, scapRet, scapDep, d2, bandTriceps, wristFlex, tyler, pronation, crossArm, tricepsStretch, reverseThrow, sleeper];
