import { Memento } from 'vscode';

export class MockExtensionContext implements Memento {
    private values: { [n: string]: any; } = {};
    
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get(key: any, defaultValue?: any) {
        let value = this.values![key];
		if (typeof value === 'undefined') {
			value = defaultValue;
		}
		return value;
    }
    update(key: string, value: any): Thenable<void> {
        return this.values[key] = value;
    }
}