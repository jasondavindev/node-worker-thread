import { Worker } from 'worker_threads';
import { Task } from './task';

export class WorkerPool<S, R> {
	private workers: { [key: number]: Worker } = {};
	private activeWorkers: { [key: number]: boolean } = {};
	private taskQueue: Task<S, R>[] = [];

	constructor(private pathWorker: string, private numThreads: number) {
		this.init();
	}

	private init() {
		if (this.numThreads > 0) {
			for (let i = 0; i < this.numThreads; i++) {
				this.workers[i] = new Worker(this.pathWorker);
				this.activeWorkers[i] = false;
			}
		}
	}

	private getInactiveWorker(): number {
		for (let i = 0; i < this.numThreads; i++) {
			if (!this.activeWorkers[i]) {
				return i;
			}
		}

		return -1;
	}

	public run(data: S) {
		return new Promise<R>((resolve, reject) => {
			const avaliableWorker = this.getInactiveWorker();

			const task: Task<S, R> = {
				data,
				callback: (error, result) => {
					if (error) {
						return reject(error);
					}

					return resolve(result);
				},
			};

			if (avaliableWorker === -1) {
				this.taskQueue.push(task);
				return null;
			}

			this.runTask(avaliableWorker, task);
		});
	}

	private runTask(workerId: number, task: Task<S, R>) {
		//console.log('running task on worker', workerId + 1);

		const worker = this.workers[workerId];

		const messageCallback = (result: R) => {
			task.callback(null, result);
			cleanUp();
		};

		const errorCallback = (error: any) => {
			task.callback(error, null);
			cleanUp();
		};

		const cleanUp = () => {
			this.activeWorkers[workerId] = false;
			this.workers[workerId].removeAllListeners('message');
			this.workers[workerId].removeAllListeners('error');

			if (this.taskQueue.length > 0) {
				this.runTask(workerId, this.taskQueue.shift());
			}
		};

		worker.once('message', messageCallback);
		worker.once('error', errorCallback);

		worker.postMessage(task.data);
		this.activeWorkers[workerId] = true;
	}
	
	public checkTaskQueue() {
		if (this.taskQueue.length === 0) {
			for (let i = 0; i < this.numThreads; i++) {
				if (!this.activeWorkers[i]) {
					this.workers[i].terminate();
				}
			}
		}
	}
}
