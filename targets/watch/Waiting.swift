import Foundation

/// The commands sent that the phone has not applied yet, and what the watch shows of the workout
/// while they wait (ADR 0121): the set to do next, the rest, the sets a finish saves, a clock's
/// start. Plain logic, kept apart from the connection in PhoneLink, so that it is tested on a Mac
/// (targets/watch-tests, #540).
struct WaitingCommands {
  /// The commands by their id.
  let commands: [String: WatchCommand]
  /// The phone can be reached now; else the sets ticked here wait out of its reach.
  let reachable: Bool

  /// Whether a tick of this set waits for the phone, which a second one would only repeat.
  func isTickWaiting(workoutId: String, exercise: Int, set: Int) -> Bool {
    firstWaiting(workoutId) { $0.isTick(exercise: exercise, set: set) } != nil
  }

  /// Whether a start of the set's clock waits for the phone.
  func isClockWaiting(workoutId: String, exercise: Int, set: Int) -> Bool {
    startWaiting(workoutId, exercise: exercise, set: set) != nil
  }

  private func startWaiting(_ workoutId: String, exercise: Int, set: Int) -> WatchCommand? {
    firstWaiting(workoutId) { $0.startsClock(exercise: exercise, set: set) }
  }

  /// When the clock of a set started, as the watch shows it: a start made here the phone has not
  /// taken, else the phone's clock; none once a tick of the set waits, which stops it (ADR 0124).
  func clockStart(of workout: WatchWorkout, exercise: Int, set: Int) -> Double? {
    if isTickWaiting(workoutId: workout.id, exercise: exercise, set: set) { return nil }
    if let started = startWaiting(workout.id, exercise: exercise, set: set) {
      return started.at
    }
    guard let clock = workout.clock, clock.exercise == exercise, clock.set == set else { return nil }
    return clock.startedAt
  }

  /// Whether a change of the workout's rest waits for the phone. Another waits until it is
  /// applied, as the phone takes a change only of the rest it has, and the two could arrive in
  /// either order.
  func isRestWaiting(workoutId: String) -> Bool {
    firstWaiting(workoutId) { $0.isRest } != nil
  }

  /// Whether finishing the workout waits for the phone, which saves it.
  func isFinishWaiting(workoutId: String) -> Bool {
    firstWaiting(workoutId) { $0.isFinish } != nil
  }

  /// The sets ticked done here that the phone has not taken yet.
  private func waitingTicks(of workout: WatchWorkout) -> Set<SetIndex> {
    Set(
      commands.values.compactMap { command -> SetIndex? in
        guard command.workoutId == workout.id,
          case .tick(let exercise, let set, _) = command.change,
          workout.exercises.indices.contains(exercise),
          workout.exercises[exercise].sets.indices.contains(set),
          !workout.exercises[exercise].sets[set].done
        else { return nil }
        return SetIndex(exercise: exercise, set: set)
      })
  }

  /// How many sets ticked here wait for the phone while it is out of reach, which the top line then
  /// says in place of the heart rate (ADR 0121); none while it can be reached.
  func setsWaitingOutOfReach(of workout: WatchWorkout) -> Int {
    reachable ? 0 : waitingTicks(of: workout).count
  }

  /// How many sets finishing the workout saves, as the watch shows it: the phone's count, and the
  /// sets ticked done here that the phone has not applied yet, as it applies them before the
  /// finish (ADR 0118).
  func setsToSave(of workout: WatchWorkout) -> Int {
    let ticked = waitingTicks(of: workout)
    // A set whose clock's start waits, which finishing logs once the phone has started it, unless
    // its tick waits too or the phone's clock already times it.
    let timed = Set(
      commands.values.compactMap { command -> SetIndex? in
        guard command.workoutId == workout.id, case .clock(let exercise, let set) = command.change,
          workout.exercises.indices.contains(exercise),
          workout.exercises[exercise].sets.indices.contains(set),
          !workout.exercises[exercise].sets[set].done,
          workout.clock.map({ $0.exercise != exercise || $0.set != set }) ?? true
        else { return nil }
        return SetIndex(exercise: exercise, set: set)
      }
    ).subtracting(ticked)
    return workout.setsToSave + ticked.count + timed.count
  }

  /// The set to do next as the watch shows it: the phone's, or, while a pick or ticks here wait
  /// for the phone, the set the phone finds once it takes them: the first not done nor ticked here
  /// from the exercise of the latest of them, as a pick opens its exercise and a tick stays on its
  /// own until it is done, or goes on through its superset's round (markDone, nextSetOf); so
  /// logging goes on with the phone out of reach (ADR 0121).
  func nextSet(of workout: WatchWorkout) -> NextSet? {
    let latest = commands.values.filter { $0.workoutId == workout.id && $0.change.leads != nil }
      .max { $0.at < $1.at }
    guard let from = latest?.change.leads, workout.exercises.indices.contains(from) else {
      return workout.phoneNextSet
    }
    let ticked = waitingTicks(of: workout)
    if latest?.change.opens != nil {
      return workout.firstOpenSet(from: from, skipping: ticked)
    }
    return workout.afterTick(of: from, ticked: ticked).next
  }

  /// The round of the superset of `next`'s exercise, with the ticks waiting for the phone taken as
  /// done; none on its own.
  func supersetRound(of next: NextSet, in workout: WatchWorkout) -> (round: Int, rounds: Int)? {
    workout.supersetRound(of: next.exerciseIndex, ticked: waitingTicks(of: workout))
  }

  /// What a tick of `next` leads to, for its rest: whether it starts one, and the set the watch
  /// shows next once the tick is sent.
  func afterTicking(_ next: NextSet, of workout: WatchWorkout) -> (rests: Bool, next: NextSet?) {
    workout.afterTick(
      of: next.exerciseIndex,
      ticked: waitingTicks(of: workout).union([
        SetIndex(exercise: next.exerciseIndex, set: next.setIndex)
      ]))
  }

  /// Whether joining the workout waits for the phone.
  func isJoinWaiting(workoutId: String) -> Bool {
    firstWaiting(workoutId) { $0.isJoin } != nil
  }

  /// The exercise picked last for the workout, while the phone has not applied the pick: its sets
  /// come next once it has (ADR 0117).
  func picked(workoutId: String) -> Int? {
    commands.values.filter { $0.workoutId == workoutId && $0.change.opens != nil }
      .max { $0.at < $1.at }?.change.opens
  }

  /// The exercise whose sets come next as the watch shows it: that of the set it shows, else the
  /// one picked last while the phone has not applied the pick.
  func openExercise(of workout: WatchWorkout) -> Int? {
    nextSet(of: workout)?.exerciseIndex ?? picked(workoutId: workout.id)
  }

  /// The workout's rest as the watch shows it: the phone's, or one a tick here starts, as changed
  /// by a change made here that the phone has not applied yet.
  func rest(of workout: WatchWorkout) -> ShownRest? {
    let ticked = commands.values.lazy.filter { $0.workoutId == workout.id }
      .compactMap(\.change.startsRest)
      .max { $0.endsAt < $1.endsAt }
    let rest =
      ticked
      ?? workout.rest.map {
        ShownRest(endsAt: $0.endsAt, seconds: $0.seconds, next: nextSet(of: workout)?.label)
      }
    guard let change = firstWaiting(workout.id, where: \.isRest)?.change,
      case .rest(let endsAt) = change
    else { return rest }
    return endsAt.map {
      ShownRest(
        endsAt: $0, seconds: rest?.seconds ?? 0, next: rest?.next ?? nextSet(of: workout)?.label)
    }
  }

  private func firstWaiting(
    _ workoutId: String, where matches: (WatchCommand.Change) -> Bool
  ) -> WatchCommand? {
    commands.values.first { $0.workoutId == workoutId && matches($0.change) }
  }
}
